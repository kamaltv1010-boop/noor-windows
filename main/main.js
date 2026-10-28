"use strict";
const path = require("path");
const fs = require("fs");
const { app, protocol, session, screen, ipcMain, net, Menu, dialog } = require("electron");
const { pathToFileURL } = require("url");
const { Store } = require("./store");
const { Profiles } = require("./profiles");
const { Fingerprint, KINDS } = require("./fingerprint");
const { Shields, Stats } = require("./shields");
const { Bookmarks } = require("./bookmarks");
const { Browser } = require("./tabs");
const { Menus } = require("./menus");
const { ENGINES, APP_ORIGIN, isAppPage, isWebPage } = require("./address");
const { userAgent, chromeVersion, brands, parseBrands, formatBrands, acceptLanguages } = require("./useragent");

const RENDERER = path.join(__dirname, "..", "renderer");
const SCRIPTS = path.join(__dirname, "..", "scripts");
/// What pages may ask for without a question. The rest (camera,
/// microphone, location, notifications…) is refused.
const ALLOWED_PERMISSIONS = new Set(["fullscreen", "pointerLock", "clipboard-sanitized-write", "window-management"]);

// The app's own pages (noor://app/…) are a proper origin, with fetch and
// storage, and no other origin can read them.
protocol.registerSchemesAsPrivileged([
  { scheme: "noor", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } },
]);

app.userAgentFallback = userAgent();
app.setAppUserModelId("ma.noor.browser");
// Pages see navigator.webdriver as false, as in Chrome, even under a
// debugger.
app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");
if (process.env.NOOR_USER_DATA) {
  // Tests keep their data apart.
  app.setPath("userData", process.env.NOOR_USER_DATA);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let browser = null;
let context = null;
/// Chromium's own "Not A Brand" entry, from its first request, so the
/// brands pages see match the headers.
let greasey = null;
let brandList = brands(chromeVersion());

const serveAppPage = (request) => {
  let url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return new Response("Bad request", { status: 400 });
  }
  if (url.host !== "app") {
    return new Response("Not found", { status: 404 });
  }
  const file = path.normalize(url.pathname === "/" ? "/start.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(RENDERER, file);
  if (!full.startsWith(RENDERER + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return new Response("Not found", { status: 404 });
  }
  return net.fetch(pathToFileURL(full).toString());
};

/// The page a request comes from: the top frame's address, or the tab's,
/// or for a request a service worker makes (no frame, no tab) the
/// referrer. Empty when it can't be told.
const pageURLOf = (details) => {
  const candidates = [];
  try {
    if (details.frame && details.frame.top) {
      candidates.push(details.frame.top.url);
    }
  } catch (error) {
    // The frame may be gone.
  }
  try {
    if (details.webContents && !details.webContents.isDestroyed()) {
      candidates.push(details.webContents.getURL());
    }
  } catch (error) {
    // The tab may be gone.
  }
  candidates.push(details.referrer);
  return candidates.find((url) => typeof url === "string" && /^(https?|noor):/i.test(url)) || "";
};

/// Every session (each profile's partition, the private ones, the
/// toolbar's) blocks trackers, serves the app's pages, refuses
/// permissions and shows Chrome's brands.
const setUpSessions = new WeakSet();
const setUpSession = (ses) => {
  if (setUpSessions.has(ses)) {
    return;
  }
  setUpSessions.add(ses);
  ses.setUserAgent(userAgent(), acceptLanguages(app.getLocale()));
  ses.protocol.handle("noor", serveAppPage);
  ses.setPermissionRequestHandler((webContents, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));
  ses.setPermissionCheckHandler((webContents, permission) => ALLOWED_PERMISSIONS.has(permission));
  guardServiceWorkers(ses);
  ses.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => {
    if (details.resourceType === "mainFrame" || !context) {
      return callback({});
    }
    const page = pageURLOf(details);
    // A request that can't be put to a page (a service worker's, say) and
    // the app's own pages (a tab's favicon in the toolbar) aren't blocked:
    // a tracker is a third party on a page.
    if (!isWebPage(page)) {
      return callback({});
    }
    if (context.shields.trackersEnabled() && context.shields.areUp(page) && context.shields.isTracker(details.url, page)) {
      if (browser) {
        browser.trackerBlocked(details.webContents);
      } else {
        context.stats.trackerBlocked();
      }
      return callback({ cancel: true });
    }
    callback({});
  });
  ses.webRequest.onBeforeSendHeaders({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => {
    const headers = details.requestHeaders;
    for (const name of Object.keys(headers)) {
      const lower = name.toLowerCase();
      if (lower === "sec-ch-ua") {
        if (!greasey) {
          greasey = parseBrands(headers[name]).find((b) => /^Not/.test(b.brand)) || null;
          if (greasey) {
            brandList = brands(chromeVersion(), greasey);
          }
        }
        headers[name] = formatBrands(brandList);
      } else if (lower === "sec-ch-ua-full-version-list") {
        headers[name] = formatBrands(fullVersionList());
      }
    }
    callback({ requestHeaders: headers });
  });
};

const fullVersionList = () => brandList.map((b) => ({
  brand: b.brand,
  version: /^Not/.test(b.brand) ? `${b.version}.0.0.0` : process.versions.chrome,
}));

/// What a page's script gets for the page at `top`: the fingerprint for
/// it, and Chrome's brands.
const configFor = (top) => {
  const protections = context.shields.areUp(top);
  const realDevice = Shields.isSignInSite(top);
  const config = context.fingerprint.config({ protections, realDevice });
  config.chrome = {
    brands: brandList,
    fullVersionList: fullVersionList(),
    fullVersion: process.versions.chrome,
  };
  config.languages = acceptLanguages(app.getLocale()).split(",");
  return config;
};

const pageConfig = (event) => {
  const tab = browser ? browser.tabFor(event.sender) : null;
  let top = "";
  try {
    top = (event.senderFrame && event.senderFrame.top && event.senderFrame.top.url) || event.sender.getURL();
  } catch (error) {
    top = event.sender.getURL();
  }
  const config = configFor(top);
  config.tabId = tab ? tab.id : null;
  return config;
};

/// The config for a worker of the page at `url` (a dedicated worker's
/// page, or a service worker's own address): the page's, with its host,
/// since a worker held before its first line has no location yet (and
/// reading it ends the renderer), and the name its script goes by, the
/// file the protection comes from, as the frames' preload is named, so its
/// frames in an error's stack are known and taken out.
const workerConfig = (url) => {
  if (!context || !isWebPage(url)) {
    return null;
  }
  const config = configFor(url);
  try {
    config.host = new URL(url).hostname;
  } catch (error) {
    config.host = "";
  }
  config.scriptName = path.join(SCRIPTS, "protect.js");
  return config;
};

/// The protection as a script for a dedicated worker of a tab: protect.js
/// with the worker's global as the window, and the tab's page config.
let protectSource = null;
const workerScript = (tab) => {
  if (protectSource === null) {
    try {
      protectSource = fs.readFileSync(path.join(SCRIPTS, "protect.js"), "utf8").replace("module.exports = protectPage;", "");
    } catch (error) {
      protectSource = "";
    }
  }
  const config = protectSource ? workerConfig(tab.webContents.isDestroyed() ? "" : tab.webContents.getURL()) : null;
  if (!config) {
    return null;
  }
  return `(() => {\n${protectSource}\ntry { protectPage(self, ${JSON.stringify(config)}); } catch (e) {}\n})();\n//# sourceURL=${config.scriptName}`;
};

/// A session's service workers get the protection from their preload (see
/// scripts/parts/sw-preload-glue.js), which asks each worker's own channel
/// for its config as the worker starts; the channel is answered from here.
const guardedWorkers = new WeakSet();
const guardServiceWorkers = (ses) => {
  try {
    ses.registerPreloadScript({ type: "service-worker", filePath: path.join(SCRIPTS, "sw-preload.js") });
  } catch (error) {
    return;
  }
  ses.serviceWorkers.on("running-status-changed", ({ versionId, runningStatus }) => {
    if (runningStatus !== "starting") {
      return;
    }
    let worker = null;
    try {
      worker = ses.serviceWorkers.getWorkerFromVersionID(versionId);
    } catch (error) {
      return;
    }
    if (!worker || guardedWorkers.has(worker)) {
      return;
    }
    guardedWorkers.add(worker);
    worker.ipc.on("noor:sw-config", (event, url) => {
      event.returnValue = workerConfig(typeof url === "string" ? url : "");
    });
  });
};

const trusted = (event) => {
  try {
    return Boolean(event.senderFrame && isAppPage(event.senderFrame.url));
  } catch (error) {
    return false;
  }
};

/// The app's pages (toolbar, start page, settings, library) call these.
const handle = (channel, handler) => {
  ipcMain.handle("noor:" + channel, (event, ...args) => {
    if (!trusted(event) || !browser) {
      throw new Error("Not allowed");
    }
    return handler(event, ...args);
  });
};

const settingsSnapshot = () => ({
  searchEngine: browser.searchEngine,
  searchEngines: Object.entries(ENGINES).map(([id, engine]) => ({ id, name: engine.name })),
  blockTrackers: context.shields.trackersEnabled(),
  httpsUpgrade: context.shields.httpsEnabled(),
  cleanLinks: context.shields.cleanLinksEnabled(),
  clearOnQuit: browser.clearOnQuit(),
  nightMode: browser.nightMode,
  protections: Object.fromEntries(KINDS.map((kind) => [kind, context.fingerprint.isEnabled(kind)])),
  values: {
    screen: context.fingerprint.screen(),
    hardware: context.fingerprint.hardware(),
    userAgent: userAgent(),
    brands: brandList,
  },
  shieldsDownSites: context.shields.downSites(),
  profiles: context.profiles.all(),
  profile: browser.profile,
  version: app.getVersion(),
  chromium: process.versions.chrome,
  electron: process.versions.electron,
});

const SETTING_KEYS = new Set(["searchEngine", "blockTrackers", "httpsUpgrade", "cleanLinks", "clearOnQuit"]);

const registerIPC = () => {
  ipcMain.on("noor:page-config", (event) => {
    try {
      event.returnValue = pageConfig(event);
    } catch (error) {
      event.returnValue = null;
    }
  });

  handle("state", () => browser.state());
  handle("tabs:new", (event, options) => { browser.newTab({ isPrivate: Boolean(options && options.isPrivate) }); });
  handle("tabs:select", (event, id) => { const tab = browser.tabWithId(id); if (tab) browser.select(tab); });
  handle("tabs:close", (event, id) => { const tab = browser.tabWithId(id); if (tab) browser.close(tab); });
  handle("nav:go", (event, text) => {
    const sender = browser.tabFor(event.sender);
    browser.go(text, sender || browser.selected);
  });
  handle("nav:back", () => browser.selected && browser.selected.goBack());
  handle("nav:forward", () => browser.selected && browser.selected.goForward());
  handle("nav:reload", () => browser.selected && browser.selected.reload());
  handle("nav:stop", () => browser.selected && browser.selected.stop());
  handle("bookmark:toggle", () => browser.toggleBookmark());
  handle("bookmarks:list", () => context.bookmarks.all());
  handle("bookmarks:remove", (event, url) => { context.bookmarks.remove(url); browser.pushState(); });
  handle("history:list", (event, query) => query ? browser.history.search(query, 200) : browser.history.all().slice(0, 500));
  handle("history:remove", (event, url) => browser.history.remove(url));
  handle("history:clear", () => browser.history.clear());
  handle("menu:more", () => browser.menus.more());
  handle("menu:profile", () => browser.menus.profile());
  handle("menu:shields", () => browser.menus.shields());
  handle("menu:tab", (event, id) => { const tab = browser.tabWithId(id); if (tab) browser.menus.tab(tab); });
  handle("start:state", (event) => ({
    profile: browser.profile,
    stats: context.stats.toJSON(),
    bookmarks: context.bookmarks.all(),
  }));
  handle("settings:get", () => settingsSnapshot());
  handle("settings:set", (event, key, value) => {
    if (SETTING_KEYS.has(key)) {
      context.store.set(key, key === "searchEngine" ? String(value) : Boolean(value));
    } else if (key === "nightMode") {
      browser.setNightMode(Boolean(value));
    } else if (key.startsWith("protection.") && KINDS.includes(key.slice("protection.".length))) {
      context.fingerprint.setEnabled(key.slice("protection.".length), Boolean(value));
    } else {
      throw new Error("Unknown setting");
    }
    browser.applyPrivacySettings();
    return settingsSnapshot();
  });
  handle("fingerprint:new", (event, kinds) => {
    const wanted = Array.isArray(kinds) ? kinds.filter((k) => KINDS.includes(k)) : KINDS;
    browser.newFingerprint(wanted);
    return settingsSnapshot();
  });
  handle("shields:set", (event, isUp) => { browser.setShieldsUp(Boolean(isUp)); });
  handle("shields:allow", (event, site) => { context.shields.setUp(true, String(site)); browser.applyPrivacySettings(); return settingsSnapshot(); });
  handle("profiles:create", (event, name) => {
    const trimmed = String(name || "").trim();
    const profile = browser.createProfile(trimmed || `Profile ${context.profiles.all().length + 1}`);
    browser.toast(`Switched to “${profile.name}”`);
    return settingsSnapshot();
  });
  handle("profiles:switch", (event, id) => { browser.switchProfile(String(id)); return settingsSnapshot(); });
  handle("profiles:delete", async (event, id) => { await browser.menus.confirmDeleteProfile(String(id)); return settingsSnapshot(); });
  handle("profiles:deleteAll", async () => { await browser.menus.confirmDeleteAllProfiles(); return settingsSnapshot(); });
  handle("session:new", () => browser.menus.confirmNewSession());
  handle("chrome:height", (event, height) => browser.setChromeHeight(height));
  handle("find", (event, text, options) => browser.find(String(text || ""), options || {}));
  handle("find:stop", () => browser.stopFind());
  handle("stats:reset", () => { context.stats.reset(); browser.pushState(); return context.stats.toJSON(); });
};

app.whenReady().then(() => {
  const userData = app.getPath("userData");
  const store = new Store(path.join(userData, "settings.json"));

  // Partitions of deleted profiles go once nothing uses them: now, before
  // any session opens.
  for (const name of store.get("doomedPartitions", [])) {
    try {
      fs.rmSync(path.join(userData, "Partitions", String(name)), { recursive: true, force: true });
    } catch (error) {
      // Left for the next launch.
    }
  }
  store.set("doomedPartitions", []);

  const profiles = new Profiles(store);
  const fingerprint = new Fingerprint(store, profiles);
  const display = screen.getPrimaryDisplay();
  fingerprint.realScreen = { width: display.size.width, height: display.size.height };
  let rules = [];
  try {
    rules = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "rules", "trackers.json"), "utf8"));
  } catch (error) {
    rules = [];
  }
  if (process.env.NOOR_TEST_RULES) {
    // Tests add a rule for their own server.
    rules = rules.concat(JSON.parse(process.env.NOOR_TEST_RULES));
  }
  const shields = new Shields(store, rules);
  const stats = new Stats(store);
  const bookmarks = new Bookmarks(path.join(userData, "bookmarks.json"));
  context = { store, profiles, fingerprint, shields, stats, bookmarks, userData };

  if (store.get("clearOnQuit", false)) {
    // Every launch is a new session: new fingerprints, and nothing left of
    // any profile's website data.
    fingerprint.newSeeds(KINDS);
    for (const profile of profiles.all()) {
      const ses = session.fromPartition(profiles.partition(profile, false));
      ses.clearStorageData().catch(() => {});
      ses.clearCache().catch(() => {});
    }
  }

  // Every session, the default one included, is set up as it is created
  // (the default one is first touched below).
  app.on("session-created", setUpSession);
  setUpSession(session.defaultSession);

  Browser.prototype.workerScript = workerScript;
  browser = new Browser(context);
  browser.menus = new Menus(browser);
  browser.toggleBookmark = () => {
    const tab = browser.selected;
    if (!tab || !isWebPage(tab.url)) {
      return false;
    }
    const url = tab.bookmarkURL;
    const saved = bookmarks.contains(tab.url) && url !== tab.url
      ? (bookmarks.remove(tab.url), false)
      : bookmarks.toggle(tab.title, url);
    browser.toast(saved ? "Bookmark added" : "Bookmark removed");
    browser.pushState();
    return saved;
  };
  browser.findOnPage = () => {
    browser.chrome.webContents.focus();
    browser.chrome.webContents.send("noor:find");
  };
  Menu.setApplicationMenu(browser.menus.application());
  registerIPC();
  if (process.env.NOOR_TEST) {
    global.noorTest = { browser, context };
  }

  app.on("second-instance", (event, argv) => {
    if (browser && !browser.win.isDestroyed()) {
      if (browser.win.isMinimized()) {
        browser.win.restore();
      }
      browser.win.focus();
      const url = argv.find((arg) => /^https?:\/\//i.test(arg));
      if (url) {
        browser.newTab({ url });
      }
    }
  });
});

app.on("web-contents-created", (event, webContents) => {
  // Nothing but the tabs' pages opens windows (the tabs set their own handler).
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-attach-webview", (e) => e.preventDefault());
});

app.on("before-quit", () => {
  if (browser) {
    browser.saveTabs();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

const report = (error) => {
  const text = String((error && error.stack) || error);
  console.error(text);
  if (!process.env.NOOR_TEST) {
    try {
      dialog.showErrorBox("Noor", text);
    } catch (e) {
      // Nothing more to do.
    }
  }
};
process.on("uncaughtException", report);
process.on("unhandledRejection", report);
