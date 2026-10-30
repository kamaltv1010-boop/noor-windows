"use strict";
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { app, protocol, session, screen, ipcMain, net, Menu, dialog, WebContentsView } = require("electron");
const { pathToFileURL } = require("url");
const { Store } = require("./store");
const { Profiles } = require("./profiles");
const { Fingerprint, KINDS } = require("./fingerprint");
const { Shields, Stats } = require("./shields");
const { Bookmarks } = require("./bookmarks");
const { Timezone } = require("./timezone");
const { Browser, CHROME_PARTITION } = require("./tabs");
const { Extensions, STORE_URL } = require("./extensions");
const { storeExtensionID, storeTitle } = require("./crx");
const { Menus } = require("./menus");
const { ENGINES, APP_ORIGIN, ERROR_URL, isAppPage, isWebPage } = require("./address");
const { userAgent, chromeVersion, brands, parseBrands, formatBrands, acceptLanguages, userAgentMetadata } = require("./useragent");
const { BrowserDebugger } = require("./browser-debugger");

const RENDERER = path.join(__dirname, "..", "renderer");
const SCRIPTS = path.join(__dirname, "..", "scripts");
/// What pages may have without a question: what Chrome grants without
/// asking (fullscreen, copying, sensors, background sync and fetch,
/// payment handlers, keeping the screen on, keyboard and pointer lock) and
/// storage access in the page itself. The rest (camera, microphone,
/// location, notifications, all screens…) is refused, as by a user who
/// says no to every site; pages see those as not asked yet (see
/// scripts/parts/chrome.js).
const ALLOWED_PERMISSIONS = new Set([
  "fullscreen", "pointerLock", "keyboardLock", "clipboard-sanitized-write", "sensors", "background-sync",
  "background-fetch", "payment-handler", "screen-wake-lock",
]);
const isAllowed = (permission, details) =>
  ALLOWED_PERMISSIONS.has(permission) || (permission === "storage-access" && Boolean(details && details.isMainFrame));

// The app's own pages (noor://app/…) are a proper origin, with fetch and
// storage, and no other origin can read them.
// One list for every scheme (a later call replaces an earlier one): the
// app's pages, and crx:, the extensions' icons in the toolbar
// (electron-chrome-extensions registers it alone when it is loaded).
protocol.registerSchemesAsPrivileged([
  { scheme: "noor", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } },
  { scheme: "crx", privileges: { bypassCSP: true } },
]);

app.userAgentFallback = userAgent();
app.setAppUserModelId("ma.noor.browser");
// Pages see navigator.webdriver as false, as in Chrome, even under a
// debugger.
app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");
/// Chromium's own debugging port, for the workers no tab's debugger reaches
/// (shared workers, and service workers; see main/browser-debugger.js): one
/// of its own for each run, on this computer only. A port given, as a
/// developer's debugger has, not one Chromium picks (0), which marks the
/// browser as automated.
const DEBUGGING_PORT = 20000 + crypto.randomInt(20000);
app.commandLine.appendSwitch("remote-debugging-port", String(DEBUGGING_PORT));
if (process.env.NOOR_USER_DATA) {
  // Tests keep their data apart.
  app.setPath("userData", process.env.NOOR_USER_DATA);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let browser = null;
let context = null;
let extensions = null;
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
/// Whether `ses` is the toolbar's (the app's own pages'), by its folder,
/// without creating it.
const isChromeSession = (ses) => {
  try {
    return path.basename(String(ses.storagePath || "")) === CHROME_PARTITION.replace(/^persist:/, "");
  } catch (error) {
    return false;
  }
};

const setUpSessions = new WeakSet();
const setUpSession = (ses) => {
  if (setUpSessions.has(ses)) {
    return;
  }
  setUpSessions.add(ses);
  ses.setUserAgent(userAgent(), acceptLanguages(app.getLocale()));
  ses.protocol.handle("noor", serveAppPage);
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => callback(isAllowed(permission, details)));
  ses.setPermissionCheckHandler((webContents, permission, origin, details) => isAllowed(permission, details));
  guardServiceWorkers(ses);
  // A profile's session (not the app's own pages', nor the default one)
  // runs the extensions.
  if (extensions && ses !== session.defaultSession && !isChromeSession(ses)) {
    extensions.attach(ses);
  }
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
  ses.webRequest.onHeadersReceived({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => {
    rememberAcceptCH(details);
    callback({});
  });
  ses.webRequest.onBeforeSendHeaders({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => {
    // An extension's service worker asking the app for its API: the
    // profile it runs in is told (see main/extension-bridge.js).
    const bridged = extensions ? extensions.bridgeHeaders(ses, details) : null;
    if (bridged) {
      return callback({ requestHeaders: bridged });
    }
    const headers = withClientHints(details);
    for (const name of Object.keys(headers)) {
      const lower = name.toLowerCase();
      // A tab's requests carry Chrome's brands already (the override set
      // through the debugging protocol, see tabs.js); the rest (a service
      // worker's, say) still name Chromium and are rewritten.
      if (lower === "sec-ch-ua") {
        if (!greasey) {
          greasey = parseBrands(headers[name]).find((b) => /^Not/.test(b.brand)) || null;
          if (greasey) {
            brandList = brands(chromeVersion(), greasey);
          }
        }
        if (headers[name].indexOf("Google Chrome") === -1) {
          headers[name] = formatBrands(brandList);
        }
      } else if (lower === "sec-ch-ua-full-version-list" && headers[name].indexOf("Google Chrome") === -1) {
        headers[name] = formatBrands(fullVersionList());
      }
    }
    callback({ requestHeaders: headers });
  });
};

// MARK: - Client hints

/// Chrome sends the low-entropy client hints (sec-ch-ua, sec-ch-ua-mobile,
/// sec-ch-ua-platform) with every request to a secure site, and the ones
/// a site asked for with Accept-CH on a page's response from the next
/// request on. Electron has no part for the navigation's hints and keeps
/// no Accept-CH, so a navigation went without, which a site's server
/// sees. They are added here, in Chrome's places: the low-entropy three
/// before Upgrade-Insecure-Requests, the asked-for ones after them, in
/// the order Chrome keeps them.
const LOW_ENTROPY_HINTS = ["sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform"];
const HIGH_ENTROPY_HINTS = ["sec-ch-ua-arch", "sec-ch-ua-model", "sec-ch-ua-full-version", "sec-ch-ua-platform-version", "sec-ch-ua-bitness", "sec-ch-ua-full-version-list", "sec-ch-ua-wow64", "sec-ch-ua-form-factors"];
/// The hints each origin asked for (Chrome keeps these per profile too).
const acceptCH = new Map();

const isSecureSite = (url) => {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" || hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch (error) {
    return false;
  }
};

const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch (error) {
    return "";
  }
};

const rememberAcceptCH = (details) => {
  if (details.resourceType !== "mainFrame" || !isSecureSite(details.url) || !details.responseHeaders) {
    return;
  }
  const name = Object.keys(details.responseHeaders).find((key) => key.toLowerCase() === "accept-ch");
  const origin = originOf(details.url);
  if (!origin) {
    return;
  }
  if (!name) {
    return;
  }
  const asked = new Set();
  for (const value of [].concat(details.responseHeaders[name])) {
    for (const token of String(value).split(",")) {
      const hint = token.trim().toLowerCase();
      if (HIGH_ENTROPY_HINTS.includes(hint)) {
        asked.add(hint);
      }
    }
  }
  acceptCH.set(origin, asked);
};

const structuredString = (value) => `"${String(value).replace(/["\\]/g, "\\$&")}"`;

/// The hints' values, from what the tabs tell of themselves.
const hintValues = () => {
  const metadata = context && context.userAgentOverride && context.userAgentOverride.userAgentMetadata;
  if (!metadata) {
    return null;
  }
  return {
    "sec-ch-ua": formatBrands(metadata.brands),
    "sec-ch-ua-mobile": metadata.mobile ? "?1" : "?0",
    "sec-ch-ua-platform": structuredString(metadata.platform),
    "sec-ch-ua-arch": structuredString(metadata.architecture),
    "sec-ch-ua-model": structuredString(metadata.model),
    "sec-ch-ua-full-version": structuredString(process.versions.chrome),
    "sec-ch-ua-platform-version": structuredString(metadata.platformVersion),
    "sec-ch-ua-bitness": structuredString(metadata.bitness),
    "sec-ch-ua-full-version-list": formatBrands(metadata.fullVersionList),
    "sec-ch-ua-wow64": metadata.wow64 ? "?1" : "?0",
    "sec-ch-ua-form-factors": metadata.formFactors.map(structuredString).join(", "),
  };
};

/// A request's headers with the hints Chrome would send, where it puts them.
const withClientHints = (details) => {
  const headers = details.requestHeaders;
  if (!isSecureSite(details.url)) {
    return headers;
  }
  const values = hintValues();
  if (!values) {
    return headers;
  }
  const isNavigation = details.resourceType === "mainFrame" || details.resourceType === "subFrame";
  const asked = acceptCH.get(originOf(details.url)) || new Set();
  const present = new Set(Object.keys(headers).map((name) => name.toLowerCase()));
  const missing = (names) => names.filter((name) => !present.has(name));
  const low = isNavigation ? missing(LOW_ENTROPY_HINTS) : [];
  const high = missing(HIGH_ENTROPY_HINTS.filter((name) => asked.has(name)));
  if (!low.length && !high.length) {
    return headers;
  }
  const rebuilt = {};
  let placed = false;
  const place = () => {
    for (const name of low) rebuilt[name] = values[name];
    for (const name of high) rebuilt[name] = values[name];
    placed = true;
  };
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (!placed && isNavigation && (lower === "upgrade-insecure-requests" || lower === "user-agent")) {
      place();
    }
    rebuilt[name] = value;
    if (!placed && !isNavigation && lower === "sec-ch-ua-mobile") {
      place();
    }
  }
  if (!placed) {
    place();
  }
  return rebuilt;
};

const fullVersionList = () => brandList.map((b) => ({
  brand: b.brand,
  version: /^Not/.test(b.brand) ? `${b.version}.0.0.0` : process.versions.chrome,
}));

/// The system's details Chromium tells of itself (navigator.userAgentData's
/// high-entropy values), read from a page of its own, for the override.
const probeHighEntropy = async () => {
  const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const stop = new Promise((resolve) => setTimeout(() => resolve(null), 3000));
  try {
    // One of the app's own pages: a secure context, which userAgentData needs.
    await Promise.race([view.webContents.loadURL(ERROR_URL), stop]);
    return await Promise.race([
      view.webContents.executeJavaScript("navigator.userAgentData ? navigator.userAgentData.getHighEntropyValues(['platformVersion', 'architecture', 'bitness', 'wow64', 'model', 'formFactors']) : null", true),
      stop,
    ]);
  } catch (error) {
    return null;
  } finally {
    try { view.webContents.close(); } catch (error) {}
  }
};

/// What a tab tells of itself, set through the debugging protocol: the
/// user agent, Chrome's brands and the system's details (so navigations
/// carry the Sec-CH-UA headers as Chrome's do, which an override of the
/// user agent alone loses), the languages, and the platform.
const userAgentOverride = (highEntropy) => ({
  userAgent: userAgent(),
  platform: "Win32",
  userAgentMetadata: userAgentMetadata({ brandList, fullVersionList: fullVersionList(), highEntropy: highEntropy || {} }),
});

/// The mark a replacement's source carries (the iPhone app's "noor
/// lookalike") and the mark of the frame the protection is made in (see
/// scripts/parts/preload-glue.js): the app's for this run, so a page can
/// neither recognize nor imitate them.
const LOOKALIKE_MARK = crypto.randomBytes(8).toString("hex");
const REALM_KEY = "_" + crypto.randomBytes(12).toString("hex");

/// What a page's script gets for the page at `top`: the fingerprint for
/// it, Chrome's brands, and the marks of the run.
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
  config.mark = LOOKALIKE_MARK;
  config.realmKey = REALM_KEY;
  return config;
};

/// The screen Chromium itself shows a tab's page at `url` (see
/// Tab.showScreen), or null for the real one.
const screenFor = (url) => {
  if (!context || !isWebPage(url)) {
    return null;
  }
  return configFor(url).screen || null;
};

const pageConfig = (event) => {
  const tab = browser ? browser.tabFor(event.sender) : null;
  let top = "";
  try {
    top = (event.senderFrame && event.senderFrame.top && event.senderFrame.top.url) || event.sender.getURL();
  } catch (error) {
    top = event.sender.getURL();
  }
  // An extension's own pages (its options, its popups) are left alone.
  if (/^chrome-extension:/i.test(top)) {
    return null;
  }
  // A window a page opened is empty (about:blank) before it loads its
  // address, and an empty window is the site of the page that made it:
  // the noise is that site's, as in the page itself.
  if (!isWebPage(top) && tab && tab.opener && !tab.opener.webContents.isDestroyed() && isWebPage(tab.opener.webContents.getURL())) {
    top = tab.opener.webContents.getURL();
  }
  const config = configFor(top);
  config.tabId = tab ? tab.id : null;
  try {
    if (isWebPage(top)) {
      config.host = new URL(top).hostname;
    }
  } catch (error) {}
  return config;
};

/// The name the protection's script goes by in a worker, where a stack can
/// show its frames: one of its own for each run of the app, with nothing of
/// the app or the user in it (the file's path holds the user's name).
const WORKER_SCRIPT_NAME = crypto.randomBytes(6).toString("hex") + ".js";

/// The config for a worker of the page at `url` (a dedicated worker's
/// page, or a service worker's own address): the page's, with its host,
/// since a worker held before its first line has no location yet (and
/// reading it ends the renderer), and the name its script goes by.
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
  config.scriptName = WORKER_SCRIPT_NAME;
  return config;
};

/// The protection as a script for a worker: protect.js (with this run's
/// mark) with the worker's global as the window, and `config`.
let protectSource = null;
const workerSource = (config) => {
  if (protectSource === null) {
    try {
      protectSource = fs.readFileSync(path.join(SCRIPTS, "protect.js"), "utf8").replace("module.exports = protectPage;", "")
        .split("noor lookalike").join(LOOKALIKE_MARK);
    } catch (error) {
      protectSource = "";
    }
  }
  if (!protectSource || !config) {
    return null;
  }
  return `(() => {\n${protectSource}\ntry { protectPage(self, ${JSON.stringify(config)}); } catch (e) {}\n})();\n//# sourceURL=${config.scriptName}`;
};

/// The protection for a dedicated worker of a tab, with the tab's page
/// config. `hidden` when the script will run as the inspector's own code,
/// whose frames no stack shows (see Tab.injectWorker).
const workerScript = (tab, hidden) => {
  const config = workerConfig(tab.webContents.isDestroyed() ? "" : tab.webContents.getURL());
  if (config && hidden) {
    config.framesHidden = true;
  }
  return workerSource(config);
};

/// Shared and service workers, reached through Chromium's own debugging
/// target (see main/browser-debugger.js): each gets the protection for its
/// own address, as the inspector's code.
let browserDebugger = null;
const debuggedWorkerScript = (url) => {
  const config = workerConfig(url);
  if (config) {
    config.framesHidden = true;
  }
  return workerSource(config);
};

/// A session's service workers get the protection through Chromium's own
/// debugging target (see debuggedWorkerScript); if that couldn't be
/// reached, from their preload (see scripts/parts/sw-preload-glue.js),
/// which asks each worker's own channel for its config as the worker
/// starts; the channel is answered from here.
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
      event.returnValue = browserDebugger && browserDebugger.active ? null : workerConfig(typeof url === "string" ? url : "");
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
  timezoneFromIP: context.timezone.enabled(),
  timezone: context.timezone.current,
  extensions: extensions ? extensions.list() : [],
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
    } else if (key === "timezoneFromIP") {
      context.timezone.setEnabled(Boolean(value));
    } else if (key.startsWith("protection.") && KINDS.includes(key.slice("protection.".length))) {
      context.fingerprint.setEnabled(key.slice("protection.".length), Boolean(value));
    } else {
      throw new Error("Unknown setting");
    }
    browser.applyPrivacySettings();
    return settingsSnapshot();
  });
  handle("extensions:store", () => { browser.newTab({ url: STORE_URL }); return settingsSnapshot(); });
  // The toolbar's "Add to Noor", on a store page.
  handle("extensions:addFromStore", async () => {
    const tab = browser.selected;
    const id = tab ? storeExtensionID(tab.url) : null;
    if (!id) {
      return false;
    }
    try {
      const name = await extensions.installFromStore(id, storeTitle(tab.title));
      if (name) {
        browser.toast(`"${name}" added`);
      }
    } catch (error) {
      dialog.showMessageBox(browser.win, { type: "error", message: "The extension wasn't added", detail: String(error.message || error) });
    }
    browser.pushState();
    return true;
  });
  handle("extensions:options", (event, url) => {
    if (/^chrome-extension:\/\/[a-p]{32}\//.test(String(url))) {
      browser.newTab({ url: String(url) });
    }
    return settingsSnapshot();
  });
  handle("extensions:enable", (event, id, isOn) => { extensions.setEnabled(String(id), Boolean(isOn)); return settingsSnapshot(); });
  handle("extensions:remove", async (event, id) => { await extensions.remove(String(id)); return settingsSnapshot(); });
  handle("extensions:install", async (event, kind) => {
    const folder = kind === "folder";
    const { canceled, filePaths } = await dialog.showOpenDialog(browser.win, {
      title: folder ? "A folder with a manifest.json" : "A .crx or .zip file",
      properties: [folder ? "openDirectory" : "openFile"],
      filters: folder ? [] : [{ name: "Extensions", extensions: ["crx", "zip"] }],
    });
    if (!canceled && filePaths[0]) {
      try {
        await extensions.installFile(filePaths[0]);
      } catch (error) {
        dialog.showMessageBox(browser.win, { type: "error", message: "The extension wasn't installed", detail: String(error.message || error) });
      }
    }
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

app.whenReady().then(async () => {
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
  const timezone = new Timezone(store, { forced: process.env.NOOR_TEST_TIMEZONE || null });
  context = { store, profiles, fingerprint, shields, stats, bookmarks, timezone, userData };
  extensions = new Extensions({ store, userData });

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
  // The toolbar's session (set up as it is created, just above) shows the
  // extensions' icons.
  extensions.showIconsIn(session.fromPartition(CHROME_PARTITION));

  // The address's time zone is asked for now; with none known yet (a
  // first launch), the first pages wait a moment for it.
  timezone.start();
  if (!timezone.current && timezone.enabled()) {
    await timezone.ready();
  }

  // What Chromium says of the system, kept for the override of every tab
  // (and from the last launch while it is read again).
  const highEntropy = await probeHighEntropy();
  if (highEntropy && typeof highEntropy === "object") {
    store.set("highEntropy", highEntropy);
  }
  context.userAgentOverride = userAgentOverride(highEntropy || store.get("highEntropy", null));

  // Shared and service workers are held as they start, from now on.
  browserDebugger = new BrowserDebugger({ port: DEBUGGING_PORT, scriptFor: debuggedWorkerScript });
  await browserDebugger.connect(2500).catch(() => false);

  Browser.prototype.workerScript = workerScript;
  Browser.prototype.screenFor = screenFor;
  Browser.prototype.extensions = extensions;
  browser = new Browser(context);
  extensions.browser = browser;
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
    global.noorTest = { browser, context, extensions, browserDebugger, mark: LOOKALIKE_MARK };
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
