"use strict";
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { app, protocol, session, screen, ipcMain, net, Menu, dialog, WebContentsView } = require("electron");
const { pathToFileURL } = require("url");
const { Store } = require("./store");
const { Profiles } = require("./profiles");
const { Fingerprint } = require("./fingerprint");
const { Shields, Stats } = require("./shields");
const { Bookmarks } = require("./bookmarks");
const { Timezone } = require("./timezone");
const { Browser, CHROME_PARTITION, pageOf } = require("./tabs");
const { Windows, profileArgument } = require("./windows");
const { Extensions, STORE_URL } = require("./extensions");
const { storeExtensionID, storeTitle } = require("./crx");
const { Menus } = require("./menus");
const { ENGINES, APP_ORIGIN, ERROR_URL, COOKIES_URL, isAppPage, isWebPage, isLocalAddress, isLocalIP, hostIsName } = require("./address");
const { userAgent, chromeVersion, brands, parseBrands, formatBrands, acceptLanguages, userAgentMetadata } = require("./useragent");
const { BrowserDebugger } = require("./browser-debugger");
const { Warmup, FAST } = require("./warmup");
const { chromeOrder } = require("./headers");
const { diskQuota: quotaOfDisk, shownQuota } = require("./quota");
const { FontList, keptBy } = require("./fonts");
const { cookieTools } = require("./cookies");
const { markDownloads } = require("./downloads");
const iphone = require("./iphone");
const android = require("./android");
const gpus = require("./gpus");
const mobile = require("./mobile");

/// Noor iPhone (see main/iphone.js): every profile is an iPhone or iPad to
/// sites, as Safari shows them. Noor Android (see main/android.js): an
/// Android phone or tablet, as Chrome shows them. MOBILE: either, the
/// device of each profile shown in each of its tabs (see main/mobile.js).
const BUILD = mobile.build();
const IPHONE = BUILD === "iphone";
const ANDROID = BUILD === "android";
const MOBILE = IPHONE || ANDROID;
const PRODUCT = mobile.product(BUILD);

/// The fonts a device shows (scripts/parts/iphone-fonts.js and
/// android-fonts.js): its own (`add`), and those it has by the same name
/// as Windows. Every other font of this computer is hidden from pages, as
/// the lists' Windows and program fonts are: the lists name the common
/// ones, this computer's own list (see main/fonts.js) the rest (a font a
/// user installed, Inter, a code editor's, Windows 11's Cascadia…), which
/// otherwise a site found, the same in every profile.
const deviceFonts = (file, name) => {
  try {
    const text = fs.readFileSync(path.join(__dirname, "..", "scripts", "parts", file), "utf8");
    return require("vm").runInNewContext(`${text}\n${name}`, {}, { timeout: 1000 });
  } catch (error) {
    return null;
  }
};
const DEVICE_FONTS = IPHONE ? deviceFonts("iphone-fonts.js", "IPHONE_FONTS") : ANDROID ? deviceFonts("android-fonts.js", "ANDROID_FONTS") : null;
const SHARED_FONTS = IPHONE
  ? ["Arial", "Courier New", "Georgia", "Times New Roman", "Trebuchet MS", "Verdana"]
  : ["Arial", "Courier New", "Georgia", "Times New Roman", "Verdana"];
/// This computer's fonts the profile's device doesn't have (shadow: the
/// names CSS asks by; local: every name local() looks for), or null while
/// they aren't known. `own`: the device's other fonts (an Android's Noto).
const deviceHidden = (key, own = []) => {
  if (!DEVICE_FONTS || !context || !context.fonts) {
    return null;
  }
  const hidden = context.fonts.hiddenFor(key, keptBy(Object.keys(DEVICE_FONTS.add || {}).concat(SHARED_FONTS, own)));
  return hidden ? { shadow: hidden.shadow, local: hidden.local } : null;
};

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

app.userAgentFallback = MOBILE ? mobile.userAgent(mobile.firstDevice(BUILD)) : userAgent();
app.setAppUserModelId(mobile.appId(BUILD));
// Pages see navigator.webdriver as false, as in Chrome, even under a
// debugger. And they don't find what Chrome no longer has but Electron
// keeps: XSLT (XSLTProcessor) and the ad auctions of the Privacy Sandbox
// (navigator.joinAdInterestGroup, runAdAuction and the rest), which tell a
// page that this isn't Chrome; nor what Electron adds and Chrome never
// had: the -electron-corner-smoothing CSS property, which one line
// (CSS.supports("-electron-corner-smoothing", "50%")) reads as Electron,
// as bot checks do.
app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled,XSLT,AdInterestGroupAPI,Fledge,FledgeBiddingAndAuctionServer,ElectronCSSCornerSmoothing");
/// Chromium's own debugging port, for the workers no tab's debugger reaches
/// (shared workers, and service workers; see main/browser-debugger.js): one
/// of its own for each run, on this computer only. A port given, as a
/// developer's debugger has, not one Chromium picks (0), which marks the
/// browser as automated.
const DEBUGGING_PORT = 20000 + crypto.randomInt(20000);
app.commandLine.appendSwitch("remote-debugging-port", String(DEBUGGING_PORT));
if (MOBILE) {
  // Frames of other sites in a page share its process, as in Safari on an
  // iPhone (and in Chrome on most Android phones, which keep a process of
  // their own for few sites): Chromium shows them the device too (its
  // touch, pixel density and screen), which it does only for frames in the
  // page's process.
  app.commandLine.appendSwitch("disable-site-isolation-trials");
}
if (process.env.NOOR_USER_DATA) {
  // Tests keep their data apart.
  app.setPath("userData", process.env.NOOR_USER_DATA);
} else if (MOBILE && !app.isPackaged) {
  // Noor iPhone or Noor Android run from the source keeps its data apart
  // from Noor's, as the built app does (its own name, its own folder).
  app.setPath("userData", path.join(app.getPath("appData"), PRODUCT));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

/// Noor started again while it runs hands over its arguments (see the end
/// of the start, launchedAgain): taken from the first moment, as the lock
/// is, and kept until the windows are up, so a launch while this one is
/// still starting (a second click on its icon, a pinned profile's button,
/// a link from another program) isn't lost.
const launchesWhileStarting = [];
let launchedAgain = null;
app.on("second-instance", (event, argv) => {
  if (launchedAgain) {
    launchedAgain(argv);
  } else {
    launchesWhileStarting.push(argv);
  }
});

/// The app's windows, one for each profile open (see main/windows.js).
let windows = null;
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
  // In no frame: no page shows the app's pages inside it (a site would
  // hold them under its own buttons), as Chrome's own pages.
  return net.fetch(pathToFileURL(full).toString()).then((response) => {
    const headers = new Headers(response.headers);
    headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    headers.set("X-Frame-Options", "DENY");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  });
};

/// Whether the name in `url` leads, for `ses`, to this computer or its own
/// network: resolved as the session's own requests are (Chromium's
/// resolver, its cache first), so a name a site points at 127.0.0.1 or a
/// router's 192.168.… (127.0.0.1.nip.io, a rebound name of its own) is
/// found out before the request goes. Each answer is kept a second. A
/// name that doesn't resolve leads nowhere.
const nameAnswers = new WeakMap();
const leadsHome = async (ses, url) => {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch (error) {
    return false;
  }
  let answers = nameAnswers.get(ses);
  if (!answers) {
    answers = new Map();
    nameAnswers.set(ses, answers);
  }
  const known = answers.get(host);
  if (known && Date.now() - known.at < 1000) {
    return known.local;
  }
  let local = false;
  try {
    const resolved = await ses.resolveHost(host, { cacheUsage: "allowed" });
    local = Boolean(resolved && Array.isArray(resolved.endpoints) && resolved.endpoints.some((endpoint) => isLocalIP(endpoint.address)));
  } catch (error) {
    local = false;
  }
  if (answers.size > 2000) {
    answers.clear();
  }
  answers.set(host, { at: Date.now(), local });
  return local;
};

/// Where each origin's pages come from, as their documents' responses tell
/// (the address of the server that sent the last one): "local" for this
/// computer or its own network, "public" for a site's, or for a document
/// that asks to be taken as a site's (Content-Security-Policy:
/// treat-as-public-address, as Chrome takes it). A page keeps what it was
/// loaded as: a site that points its own name at 127.0.0.1 once its page
/// is loaded ("DNS rebinding") stays a site's, and a page a device of this
/// network serves under a name of its own (nas.local) is that network's.
const originPlaces = new Map();
const rememberPlace = (details) => {
  if (details.resourceType !== "mainFrame" && details.resourceType !== "subFrame") {
    return;
  }
  let origin = null;
  try {
    origin = new URL(details.url).origin;
  } catch (error) {
    return;
  }
  if (!origin || origin === "null") {
    return;
  }
  let asksPublic = false;
  for (const [name, values] of Object.entries(details.responseHeaders || {})) {
    if (name.toLowerCase() === "content-security-policy") {
      asksPublic = asksPublic || [].concat(values).some((value) => /(^|;)\s*treat-as-public-address\s*(;|$)/i.test(String(value)));
    }
  }
  const place = asksPublic ? "public" : details.ip ? (isLocalIP(details.ip) ? "local" : "public") : null;
  if (!place) {
    return;
  }
  if (originPlaces.size > 5000) {
    originPlaces.clear();
  }
  originPlaces.set(origin, place);
};
/// Where the page at `url` comes from: "local" by its address alone
/// (localhost, 192.168.…), else as its document's response told, or null
/// if that isn't known (a service worker's answer, say).
const placeOf = (url) => {
  if (isLocalAddress(url)) {
    return "local";
  }
  try {
    return originPlaces.get(new URL(url).origin) || null;
  } catch (error) {
    return null;
  }
};

/// The rest of what a request goes through once its address is allowed:
/// a request that can't be put to a page (a service worker's, say) and the
/// app's own pages (a tab's favicon in the toolbar) aren't blocked; a
/// tracker, a third party on a page, is.
const afterAddress = (details, page, callback) => {
  if (!isWebPage(page) || !context) {
    return callback({});
  }
  if (context.shields.trackersEnabled() && context.shields.areUp(page) && context.shields.isTracker(details.url, page)) {
    if (windows) {
      windows.trackerBlocked(details.webContents);
    } else {
      context.stats.trackerBlocked();
    }
    return callback({ cancel: true });
  }
  return callback({});
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

/// The language Noor iPhone tells sites of, as Safari does: the system's
/// first, with its region (see main/iphone.js).
let iphoneLanguageTag = null;
const iphoneLanguage = () => {
  if (!iphoneLanguageTag) {
    let preferred = [];
    try {
      preferred = app.getPreferredSystemLanguages();
    } catch (error) {
      preferred = [];
    }
    iphoneLanguageTag = iphone.languageTag(preferred && preferred.length ? preferred : [app.getLocale()]);
  }
  return iphoneLanguageTag;
};

/// Noor iPhone and Noor Android: the kinds of device a profile can be, and
/// what new profiles are ("iphone" or "ipad", "phone" or "tablet": the
/// settings; see Windows.setDevices).
const FAMILIES = mobile.familiesOf(BUILD);
const newProfileDevice = () => {
  const value = context ? context.store.get("newProfileDevice", FAMILIES[0]) : FAMILIES[0];
  return FAMILIES.includes(value) ? value : FAMILIES[0];
};

/// Noor Android: Chrome's client hints for a device (see main/android.js).
const androidMetadata = (device) => android.userAgentMetadata(device, { brandList, fullVersionList: fullVersionList() });

/// What a tab of `device` is told (see Tab.emulate): the user agent
/// override for the debugging protocol and the languages its session sends.
/// An iPhone's: Safari's agent, platform and single language; an Android
/// device's: Chrome's agent, with its client hints and Chrome's languages.
const deviceOverride = (device) => {
  if (ANDROID) {
    return {
      override: { userAgent: android.userAgent(device), platform: device.platform, userAgentMetadata: androidMetadata(device) },
      sessionLanguages: acceptLanguages(app.getLocale()),
    };
  }
  const language = iphoneLanguage();
  return {
    override: { userAgent: iphone.userAgent(device), acceptLanguage: language, platform: device.platform },
    sessionLanguages: iphone.acceptLanguage(language),
  };
};

const setUpSessions = new WeakSet();
const setUpSession = (ses) => {
  if (setUpSessions.has(ses)) {
    return;
  }
  setUpSessions.add(ses);
  if (MOBILE) {
    // The device of the profile in use, whose tabs make the sessions they
    // are in; a change of device tells its sessions again (see tabs.js).
    const current = context ? context.fingerprint.iphone() : mobile.firstDevice(BUILD);
    const told = deviceOverride(current);
    ses.setUserAgent(told.override.userAgent, told.sessionLanguages);
  } else {
    ses.setUserAgent(userAgent(), acceptLanguages(app.getLocale()));
  }
  ses.protocol.handle("noor", serveAppPage);
  // The app's own pages may list this computer's fonts (see main/fonts.js);
  // a site may not.
  const appAsksFonts = (permission, url) => permission === "local-fonts" && /^noor:\/\/app(\/|$)/.test(String(url || ""));
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => callback(isAllowed(permission, details) || appAsksFonts(permission, details && details.requestingUrl)));
  ses.setPermissionCheckHandler((webContents, permission, origin, details) => isAllowed(permission, details) || appAsksFonts(permission, origin));
  guardServiceWorkers(ses);
  // What it downloads is marked as from the internet (see main/downloads.js).
  markDownloads(ses, (each) => privateSessions.has(each));
  // A profile's session (not the app's own pages', nor the default one)
  // runs the extensions.
  if (extensions && ses !== session.defaultSession && !isChromeSession(ses)) {
    extensions.attach(ses);
  }
  ses.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (details, callback) => {
    if (details.resourceType === "mainFrame" || !context) {
      return callback({});
    }
    const page = pageURLOf(details);
    // A site's page reaching into this computer or its network (127.0.0.1,
    // a router's 192.168.…): Chrome asks the user first ("local network
    // access"), Electron doesn't, and a site could look for what runs here
    // (Noor's debugging port among the rest). Refused, as by a user who
    // says no; a page of this computer or network may still.
    const place = isWebPage(page) ? placeOf(page) : null;
    if (isLocalAddress(details.url) && isWebPage(page) && place !== "local") {
      return callback({ cancel: true });
    }
    // The same through a name that leads there (127.0.0.1.nip.io, a name
    // of the site's own pointed at a router's 192.168.1.1, or at 127.0.0.1
    // once its page is loaded): for a page known to be a site's, where the
    // name leads decides, as in Chrome, not how it is written.
    if (place === "public" && hostIsName(details.url)) {
      leadsHome(ses, details.url).then((home) => (home ? callback({ cancel: true }) : afterAddress(details, page, callback)), () => afterAddress(details, page, callback));
      return undefined;
    }
    return afterAddress(details, page, callback);
  });
  ses.webRequest.onHeadersReceived({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => {
    rememberAcceptCH(details);
    rememberPlace(details);
    callback({});
  });
  ses.webRequest.onBeforeSendHeaders({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => {
    // An extension's service worker asking the app for its API: the
    // profile it runs in is told (see main/extension-bridge.js).
    const bridged = extensions ? extensions.bridgeHeaders(ses, details) : null;
    if (bridged) {
      return callback({ requestHeaders: bridged });
    }
    if (IPHONE) {
      // As Safari on the profile's iPhone sends them (see main/iphone.js).
      const current = context ? fingerprintOfSession(ses).iphone() : mobile.firstDevice(BUILD);
      return callback({ requestHeaders: iphone.safariHeaders(details.requestHeaders, { type: details.resourceType, iphone: current, language: iphoneLanguage() }) });
    }
    // Noor Android: as Chrome on the profile's device sends them, its
    // client hints those of the device (see main/android.js).
    const device = ANDROID ? (context ? fingerprintOfSession(ses).iphone() : mobile.firstDevice(BUILD)) : null;
    const headers = withClientHints(details, device ? androidMetadata(device) : undefined);
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
    // In Chrome's order (see main/headers.js).
    callback({ requestHeaders: chromeOrder(device ? android.hintHeaders(headers, device) : headers, details.resourceType) });
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
  if (IPHONE || details.resourceType !== "mainFrame" || !isSecureSite(details.url) || !details.responseHeaders) {
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
/// `metadata`: a device's (Noor Android), or every tab's (Noor).
const hintValues = (metadata = context && context.userAgentOverride && context.userAgentOverride.userAgentMetadata) => {
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

/// A request's headers with the hints Chrome would send, where it puts them
/// (`metadata`: the device's, in Noor Android).
const withClientHints = (details, metadata = undefined) => {
  const headers = details.requestHeaders;
  if (!isSecureSite(details.url)) {
    return headers;
  }
  const values = hintValues(metadata || undefined);
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

/// Which profile a session is, and a browser context (as Chromium's
/// debugging names a session), as their tabs tell (see registerTab): the
/// pages and workers of a profile collecting cookies in the background
/// show its own fingerprints, not those of the profile in use.
const sessionProfiles = new Map();
const contextProfiles = new Map();
/// The sessions of private tabs, and the session of each browser context,
/// as their tabs tell too: for the storage quota (see storageQuotaFor).
const privateSessions = new WeakSet();
const contextSessions = new Map();

/// The fingerprints of the profile `id` (the window in front's if none),
/// whichever window is in front.
const fingerprintFor = (id) => {
  const profile = id ? context.profiles.find(id) : null;
  if (profile) {
    return context.fingerprint.forProfile(profile);
  }
  const front = windows && windows.current;
  return front ? front.fingerprint : context.fingerprint;
};
const fingerprintOfSession = (ses) => fingerprintFor(ses ? sessionProfiles.get(ses) : null);

/// A new tab tells which profile its session and browser context are.
const registerTab = (tab) => {
  let ses = null;
  try {
    ses = tab.webContents.session;
    sessionProfiles.set(ses, tab.profile.id);
    if (tab.isPrivate) {
      privateSessions.add(ses);
    }
  } catch (error) {
    return;
  }
  if (tab.debugging) {
    tab.webContents.debugger.sendCommand("Target.getTargetInfo").then((answer) => {
      const id = answer && answer.targetInfo && answer.targetInfo.browserContextId;
      if (id) {
        contextProfiles.set(id, tab.profile.id);
        contextSessions.set(id, ses);
      }
    }).catch(() => {});
  }
};

/// The storage quota a window of Chrome's shows a page on this computer
/// (see main/quota.js), from the disk the app's data is on: read again
/// after a minute, as Chromium does.
const DISK_QUOTA_MS = 60 * 1000;
let diskQuotaRead = null;
const diskQuota = () => {
  const now = Date.now();
  if (diskQuotaRead && now - diskQuotaRead.at < DISK_QUOTA_MS) {
    return diskQuotaRead.value;
  }
  let value = null;
  try {
    value = quotaOfDisk(fs.statfsSync(app.getPath("userData")));
    // Tests give the free space of a nearly full disk.
    if (value && process.env.NOOR_TEST && process.env.NOOR_TEST_DISK_FREE) {
      value.free = Number(process.env.NOOR_TEST_DISK_FREE);
    }
  } catch (error) {
    value = null;
  }
  diskQuotaRead = { at: now, value };
  return value;
};

/// The quota the pages and workers of `ses` read in place of Chromium's
/// (see scripts/parts/chrome.js and main/quota.js), or null for Chromium's
/// own: a profile kept in memory only (Clear Everything on Quit) would
/// read an incognito window's, a part of the memory, and pass for
/// incognito, as would any profile on a nearly full disk; a profile on a
/// disk with room reads Chrome's already, and a private tab keeps the
/// incognito one, as Chrome's incognito windows do.
const storageQuotaFor = (ses) => {
  try {
    return !IPHONE && ses && !privateSessions.has(ses) ? shownQuota(diskQuota(), !ses.isPersistent()) : null;
  } catch (error) {
    return null;
  }
};

/// `config` (a page's or a worker's, or null) with the quota of `ses`'s
/// pages, if they read one in place of Chromium's.
const withStorageQuota = (config, ses) => {
  const quota = config ? storageQuotaFor(ses) : null;
  if (quota) {
    config.storageQuota = quota;
  }
  return config;
};

/// What a page's script gets for the page at `top`: the fingerprint for
/// it (`fingerprint`: its profile's), Chrome's brands, and the marks of
/// the run.
const configFor = (top, fingerprint = context.fingerprint) => {
  const protections = context.shields.areUp(top);
  const realDevice = Shields.isSignInSite(top);
  const config = fingerprint.config({ protections, realDevice });
  const fontsSeed = config.fontsSeed;
  delete config.fontsSeed;
  if (IPHONE) {
    // The profile's iPhone, on every site: Chromium shows its screen (see
    // Tab.emulate), frames of other sites get it here, with no taskbar;
    // Safari's single language; and the rest an iPhone is and lacks (see
    // scripts/parts/iphone.js).
    const current = fingerprint.iphone();
    config.screen = { width: current.width, height: current.height, availHeight: current.height };
    config.languages = [iphoneLanguage()];
    // With this computer's fonts an iPhone lacks, hidden (see DEVICE_FONTS).
    config.iphone = Object.assign(iphone.pageConfig(current), { hiddenFonts: deviceHidden("iphone") });
    config.mark = LOOKALIKE_MARK;
    config.realmKey = REALM_KEY;
    return config;
  }
  if (ANDROID) {
    // The profile's Android device, on every site: Chromium shows its
    // screen (see Tab.emulate), frames of other sites get it here; Chrome's
    // brands and languages, the cores of the device's processor and its
    // memory, its graphics card (unless WebGL Vendor & Renderer is off),
    // and the rest Chrome on Android is and lacks (see
    // scripts/parts/android.js).
    const current = fingerprint.iphone();
    config.screen = { width: current.width, height: current.height, availHeight: current.height };
    config.hardware = { cores: current.cores, memory: current.memory };
    config.chrome = { brands: brandList, fullVersionList: fullVersionList(), fullVersion: process.versions.chrome };
    config.languages = acceptLanguages(app.getLocale()).split(",");
    // Android's Noto fonts this profile's Android has (all of them with
    // Fonts off); and this computer's fonts it lacks, hidden (see
    // DEVICE_FONTS).
    const fontsSeedHere = fingerprint.isEnabled("fonts") ? fingerprint.seed("fonts") : null;
    const notoFonts = android.fontsOf(fontsSeedHere);
    config.android = Object.assign(android.pageConfig(current, { graphics: fingerprint.isEnabled("gpu") }), {
      fonts: notoFonts,
      hiddenFonts: deviceHidden(`android ${fontsSeedHere === null ? "all" : fontsSeedHere >>> 0}`, notoFonts.add.map((font) => font[0])),
      userAgent: android.userAgent(current),
      metadata: androidMetadata(current),
      battery: android.batteryOf(fingerprint.seed("device")),
    });
    config.mark = LOOKALIKE_MARK;
    config.realmKey = REALM_KEY;
    return config;
  }
  config.chrome = {
    brands: brandList,
    fullVersionList: fullVersionList(),
    fullVersion: process.versions.chrome,
  };
  config.languages = acceptLanguages(app.getLocale()).split(",");
  // Fonts: Windows' own and the profile's own others, the rest of this
  // computer's hidden (see main/fonts.js).
  const fonts = fontsSeed !== null && fontsSeed !== undefined && context.fonts ? context.fonts.forSeed(fontsSeed) : null;
  if (fonts && (fonts.shadow.length || fonts.added.length)) {
    config.fonts = {
      shadow: fonts.shadow,
      local: fonts.local,
      added: fonts.added.map(({ name, kind, standIn, sizeAdjust }) => ({ name, kind, standIn, sizeAdjust })),
    };
  }
  config.mark = LOOKALIKE_MARK;
  config.realmKey = REALM_KEY;
  return config;
};

/// The screen Chromium itself shows a tab's page at `url` (see
/// Tab.showScreen), or null for the real one.
const screenFor = (url, fingerprint) => {
  if (MOBILE || !context || !isWebPage(url)) {
    return null;
  }
  return configFor(url, fingerprint || context.fingerprint).screen || null;
};

const pageConfig = (event) => {
  const tab = windows ? windows.tabFor(event.sender) : null;
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
  const config = configFor(top, fingerprintOfSession(event.sender.session));
  config.tabId = tab ? tab.id : null;
  try {
    if (isWebPage(top)) {
      config.host = new URL(top).hostname;
    }
  } catch (error) {}
  return tab && tab.isPrivate ? config : withStorageQuota(config, event.sender.session);
};

/// The name the protection's script goes by in a worker, where a stack can
/// show its frames: one of its own for each run of the app, with nothing of
/// the app or the user in it (the file's path holds the user's name).
const WORKER_SCRIPT_NAME = crypto.randomBytes(6).toString("hex") + ".js";

/// The config for a worker of the page at `url` (a dedicated worker's
/// page, or a service worker's own address): the page's, with its host,
/// since a worker held before its first line has no location yet (and
/// reading it ends the renderer), and the name its script goes by.
const workerConfig = (url, fingerprint) => {
  if (!context || !isWebPage(url)) {
    return null;
  }
  const config = configFor(url, fingerprint || context.fingerprint);
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
  // Its value is what protectPage hands back: what the worker gets once
  // its own script is about to run (see Tab.injectWorker).
  return `(() => {\n${protectSource}\ntry { return protectPage(self, ${JSON.stringify(config)}); } catch (e) { return undefined; }\n})();\n//# sourceURL=${config.scriptName}`;
};

/// The protection for a dedicated worker of a tab, with the tab's page
/// config. `hidden` when the script will run as the inspector's own code,
/// whose frames no stack shows (see Tab.injectWorker).
const workerScript = (tab, hidden) => {
  const config = workerConfig(tab.webContents.isDestroyed() ? "" : tab.webContents.getURL(), tab.fingerprint);
  if (config && hidden) {
    config.framesHidden = true;
  }
  return workerSource(tab.isPrivate ? config : withStorageQuota(config, tab.webContents.isDestroyed() ? null : tab.webContents.session));
};

/// Shared and service workers, reached through Chromium's own debugging
/// target (see main/browser-debugger.js): each gets the protection for its
/// own address, as the inspector's code.
let browserDebugger = null;
const debuggedWorkerScript = (url, browserContextId) => {
  const config = workerConfig(url, fingerprintFor(contextProfiles.get(browserContextId)));
  if (config) {
    config.framesHidden = true;
  }
  return workerSource(withStorageQuota(config, contextSessions.get(browserContextId)));
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
      event.returnValue = browserDebugger && browserDebugger.active ? null : withStorageQuota(workerConfig(typeof url === "string" ? url : "", fingerprintOfSession(ses)), ses);
    });
  });
};

/// Whether a call comes from one of the app's pages, itself on top: not
/// one a site holds in a frame of its own (where it could be hidden under
/// the site's buttons, its own clicked unseen).
const trusted = (event) => {
  try {
    const frame = event.senderFrame;
    return Boolean(frame && isAppPage(frame.url) && (!frame.top || isAppPage(frame.top.url)));
  } catch (error) {
    return false;
  }
};

/// The app's pages (toolbar, start page, settings, library) call these.
const handle = (channel, handler) => {
  ipcMain.handle("noor:" + channel, (event, ...args) => {
    if (!trusted(event) || !windows || !windows.current) {
      throw new Error("Not allowed");
    }
    return handler(event, ...args);
  });
};

/// The window an app's page is in (its toolbar, or a tab of it), or the
/// one in front.
const windowOf = (event) => (event && windows.browserFor(event.sender)) || windows.current;

/// The settings as the page of `browser` (a window) shows them: its
/// profile's fingerprints.
const settingsSnapshot = (browser = windows.current) => ({
  searchEngine: browser.searchEngine,
  searchEngines: Object.entries(ENGINES).map(([id, engine]) => ({ id, name: engine.name })),
  blockTrackers: context.shields.trackersEnabled(),
  httpsUpgrade: context.shields.httpsEnabled(),
  cleanLinks: context.shields.cleanLinksEnabled(),
  clearOnQuit: browser.clearOnQuit(),
  nightMode: browser.nightMode,
  timezoneFromIP: context.timezone.enabled(),
  timezone: context.timezone.current,
  timezoneInfo: context.timezone.info,
  // The fonts of the profile (see main/fonts.js): its picks beyond
  // Windows' own, how many of them Noor draws (this computer lacks them),
  // and this computer's fonts it hides; null in Noor iPhone, or while this
  // computer's fonts aren't known.
  fonts: !MOBILE && context.fonts && context.fonts.known ? (() => {
    const fonts = context.fonts.forSeed(browser.fingerprint.seed("fonts"));
    return { groups: fonts.picked.groups, singles: fonts.picked.singles, drawn: fonts.added.length, hidden: fonts.families };
  })() : null,
  extensions: extensions ? extensions.list() : [],
  kinds: browser.fingerprint.kinds,
  protections: Object.fromEntries(browser.fingerprint.kinds.map((kind) => [kind, browser.fingerprint.isEnabled(kind)])),
  values: MOBILE ? (() => {
    const current = browser.fingerprint.iphone();
    return {
      iphone: {
        family: current.family, name: current.name, iOS: current.iOS, android: current.android, model: current.model,
        width: current.width, height: current.height, scale: current.scale, pageWidth: current.pageWidth, pageHeight: current.pageHeight,
        desktop: current.desktop, platform: current.platform, cores: current.cores, memory: current.memory, gpu: current.gpu,
        // Noor Android: the device's processor, and its graphics card as
        // Chrome on it tells sites (see main/android.js).
        soc: current.soc, graphics: ANDROID ? android.graphicsOf(current) : null,
      },
      // Noor Android: the Noto fonts of the profile's Android.
      notoFonts: ANDROID ? android.fontsOf(browser.fingerprint.isEnabled("fonts") ? browser.fingerprint.seed("fonts") : null).add.map((font) => font[0]) : null,
      userAgent: mobile.userAgent(current),
      language: ANDROID ? acceptLanguages(app.getLocale()) : iphoneLanguage(),
    };
  })() : {
    screen: browser.fingerprint.screen(),
    hardware: browser.fingerprint.hardware(),
    // The profile's graphics card (see main/gpus.js).
    gpu: gpus.graphicsOf(browser.fingerprint.gpu()),
    userAgent: userAgent(),
    brands: brandList,
  },
  device: BUILD,
  // Noor iPhone and Noor Android: the kinds of device a profile can be
  // (with their names), this profile's, and what new profiles are.
  families: FAMILIES.map((family) => ({ id: family, name: mobile.kindName(family), plural: mobile.kindPlural(family) })),
  deviceFamily: MOBILE ? browser.fingerprint.family() : null,
  newProfileDevice: MOBILE ? newProfileDevice() : null,
  shieldsDownSites: context.shields.downSites(),
  // Noor iPhone: each profile with the iPhone or iPad it is.
  profiles: MOBILE ? context.profiles.all().map((profile) => Object.assign({}, profile, { device: context.fingerprint.forProfile(profile).iphone().name })) : context.profiles.all(),
  profile: browser.profile,
  // The profiles open in a window, and whether closing one replaces it.
  openProfiles: windows.shown.map((w) => w.profile.id),
  freshOnClose: windows.freshOnClose(),
  version: app.getVersion(),
  chromium: process.versions.chrome,
  electron: process.versions.electron,
});

/// Collecting cookies (see main/warmup.js), for every window: what is under
/// way goes to the app's pages (the settings), and its start and end show
/// in the window in front. Tests give their own sites, and quicker visits.
const makeWarmup = (target) => {
  const test = Boolean(process.env.NOOR_TEST);
  let sites = null;
  if (test && process.env.NOOR_TEST_WARMUP_SITES) {
    try {
      sites = JSON.parse(process.env.NOOR_TEST_WARMUP_SITES);
    } catch (error) {
      sites = null;
    }
  }
  const timing = test && process.env.NOOR_TEST_WARMUP_FAST ? Object.assign({}, FAST) : {};
  if (test && process.env.NOOR_TEST_WARMUP_FOLLOW) {
    timing.follow = Number(process.env.NOOR_TEST_WARMUP_FOLLOW);
  }
  const warmup = new Warmup(target, { sites, timing });
  // Each profile's collection, as it starts and ends: one line for the
  // profiles that start (or end) together.
  const wasRunning = new Map();
  const news = { started: [], ended: [] };
  let newsTimer = null;
  let newsSince = 0;
  const tell = () => {
    // Profiles started together are told together: while some of them are
    // still beginning (each counts its cookies first, at its own pace on a
    // slower computer), the line waits for them, 5 s at most.
    if (warmup.beginning.size && Date.now() - newsSince < 5000) {
      newsTimer = setTimeout(tell, 200);
      return;
    }
    newsTimer = null;
    const { started, ended } = news;
    news.started = [];
    news.ended = [];
    const lines = [];
    if (started.length === 1) {
      lines.push(`Collecting cookies in “${started[0].profileName}”…`);
    } else if (started.length > 1) {
      lines.push(`Collecting cookies in ${started.length} profiles at once…`);
    }
    if (ended.length === 1) {
      const status = ended[0];
      const name = `“${status.profileName}”`;
      lines.push(status.stopped ? `${name}: stopped, ${status.added} new cookies` : `${name}: ${status.added} new cookies from ${status.done - status.failed} sites`);
    } else if (ended.length > 1) {
      const added = ended.reduce((sum, status) => sum + status.added, 0);
      lines.push(`${ended.length} profiles ${ended.every((status) => status.stopped) ? "stopped" : "done"}: ${added} new cookies`);
    }
    if (lines.length) {
      target.toast(lines.join(" · "));
    }
  };
  warmup.onChange((status) => {
    const view = { ...warmup.view(status.profileId), ...status };
    for (const tab of target.allTabs) {
      if (!tab.webContents.isDestroyed() && isAppPage(tab.webContents.getURL())) {
        tab.webContents.send("noor:warmup", view);
      }
    }
    const before = wasRunning.get(status.profileId) || false;
    if (status.running !== before) {
      (status.running ? news.started : news.ended).push(status);
      if (!newsTimer) {
        newsSince = Date.now();
        newsTimer = setTimeout(tell, 400);
      }
    }
    wasRunning.set(status.profileId, status.running);
  });
  return warmup;
};

/// A profile by its id, or the one of the window an app's page is in.
const profileFor = (id, event = null) => context.profiles.find(String(id || "")) || windowOf(event).profile;

/// The profiles' cookies (see main/cookies.js): each profile's normal
/// session, the one its tabs use.
const cookies = cookieTools((profile) => session.fromPartition(windows.partitionFor(false, profile)));

const SETTING_KEYS = new Set(["searchEngine", "blockTrackers", "httpsUpgrade", "cleanLinks", "clearOnQuit", "freshOnClose"]);

const registerIPC = () => {
  ipcMain.on("noor:page-config", (event) => {
    try {
      event.returnValue = pageConfig(event);
    } catch (error) {
      event.returnValue = null;
    }
  });

  // Each call acts on the window its page is in (`at`).
  const on = (channel, handler) => handle(channel, (event, ...args) => handler(windowOf(event), event, ...args));
  on("state", (at) => at.state());
  on("tabs:new", (at, event, options) => { at.newTab({ isPrivate: Boolean(options && options.isPrivate) }); });
  on("tabs:select", (at, event, id) => { const tab = at.tabWithId(id); if (tab) at.select(tab); });
  on("tabs:close", (at, event, id) => { const tab = at.tabWithId(id); if (tab) at.close(tab); });
  on("nav:go", (at, event, text) => {
    const sender = at.tabFor(event.sender);
    at.go(text, sender || at.selected);
  });
  on("nav:back", (at) => at.selected && at.selected.goBack());
  on("nav:forward", (at) => at.selected && at.selected.goForward());
  on("nav:reload", (at) => at.selected && at.selected.reload());
  on("nav:stop", (at) => at.selected && at.selected.stop());
  on("bookmark:toggle", (at) => at.toggleBookmark());
  handle("bookmarks:list", () => context.bookmarks.all());
  handle("bookmarks:remove", (event, url) => { context.bookmarks.remove(url); windows.pushState(); });
  // Pinned links (see Browser.togglePin): opened as an address typed is.
  on("pin:toggle", (at) => at.togglePin());
  handle("pins:remove", (event, url) => { context.pins.remove(url); windows.pushState(); });
  on("history:list", (at, event, query) => query ? at.history.search(query, 200) : at.history.all().slice(0, 500));
  on("history:remove", (at, event, url) => at.history.remove(url));
  on("history:clear", (at) => at.history.clear());
  // The toolbar's menus, drawn over the window under their button (`rect`,
  // in the pixels of the page the button is on), as Chrome's (see
  // Browser.showMenu); what is chosen in one, and closing it.
  const anchorOf = (at, event, rect) => {
    if (!rect || typeof rect !== "object") {
      return null;
    }
    const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
    const anchor = { x: number(rect.x), y: number(rect.y), width: number(rect.width), height: number(rect.height) };
    // A button on a page (the start page's): the page's place in the window.
    const tab = at.tabFor(event.sender);
    if (tab) {
      const bounds = tab.view.getBounds();
      anchor.x += bounds.x;
      anchor.y += bounds.y;
    }
    return anchor;
  };
  on("menu:more", (at, event, rect) => at.menus.more(anchorOf(at, event, rect)));
  on("menu:profile", (at, event, rect, align) => at.menus.profile(anchorOf(at, event, rect), ["start", "center", "end"].includes(align) ? align : "end"));
  on("menu:shields", (at, event, rect) => at.menus.shields(anchorOf(at, event, rect)));
  on("menu:choose", (at, event, id) => at.chooseMenu(String(id)));
  on("menu:close", (at) => at.hideMenu());
  on("menu:tab", (at, event, id) => { const tab = at.tabWithId(id); if (tab) at.menus.tab(tab); });
  on("start:state", (at) => ({
    profile: at.profile,
    stats: context.stats.toJSON(),
    bookmarks: context.bookmarks.all(),
    pins: context.pins.all(),
  }));
  on("settings:get", (at) => settingsSnapshot(at));
  // The time zone's address looked at again now (see main/timezone.js).
  on("timezone:check", async (at) => {
    await context.timezone.refresh();
    return settingsSnapshot(at);
  });
  on("settings:set", (at, event, key, value) => {
    if (SETTING_KEYS.has(key)) {
      context.store.set(key, key === "searchEngine" ? String(value) : Boolean(value));
    } else if (key === "newProfileDevice" && MOBILE) {
      context.store.set(key, FAMILIES.includes(value) ? value : FAMILIES[0]);
    } else if (key === "nightMode") {
      windows.setNightMode(Boolean(value));
    } else if (key === "timezoneFromIP") {
      context.timezone.setEnabled(Boolean(value));
    } else if (key.startsWith("protection.") && context.fingerprint.kinds.includes(key.slice("protection.".length)) && key !== "protection.device") {
      context.fingerprint.setEnabled(key.slice("protection.".length), Boolean(value));
    } else {
      throw new Error("Unknown setting");
    }
    windows.applyPrivacySettings();
    return settingsSnapshot(at);
  });
  on("extensions:store", (at) => { at.newTab({ url: STORE_URL }); return settingsSnapshot(at); });
  // The toolbar's "Add to Noor", on a store page.
  on("extensions:addFromStore", async (at) => {
    const tab = at.selected;
    const id = tab ? storeExtensionID(tab.url) : null;
    if (!id) {
      return false;
    }
    try {
      const name = await extensions.installFromStore(id, storeTitle(tab.title));
      if (name) {
        at.toast(`"${name}" added`);
      }
    } catch (error) {
      dialog.showMessageBox(at.win, { type: "error", message: "The extension wasn't added", detail: String(error.message || error) });
    }
    windows.pushState();
    return true;
  });
  on("extensions:options", (at, event, url) => {
    if (/^chrome-extension:\/\/[a-p]{32}\//.test(String(url))) {
      at.newTab({ url: String(url) });
    }
    return settingsSnapshot(at);
  });
  on("extensions:enable", (at, event, id, isOn) => { extensions.setEnabled(String(id), Boolean(isOn)); return settingsSnapshot(at); });
  on("extensions:remove", async (at, event, id) => { await extensions.remove(String(id)); return settingsSnapshot(at); });
  on("extensions:install", async (at, event, kind) => {
    const folder = kind === "folder";
    const { canceled, filePaths } = await dialog.showOpenDialog(at.win, {
      title: folder ? "A folder with a manifest.json" : "A .crx or .zip file",
      properties: [folder ? "openDirectory" : "openFile"],
      filters: folder ? [] : [{ name: "Extensions", extensions: ["crx", "zip"] }],
    });
    if (!canceled && filePaths[0]) {
      try {
        await extensions.installFile(filePaths[0]);
      } catch (error) {
        dialog.showMessageBox(at.win, { type: "error", message: "The extension wasn't installed", detail: String(error.message || error) });
      }
    }
    return settingsSnapshot(at);
  });
  // Noor iPhone: this profile becomes an iPhone or an iPad (a new one).
  on("device:family", (at, event, family) => {
    if (MOBILE && FAMILIES.includes(family) && family !== at.fingerprint.family()) {
      at.setDeviceFamily(family);
    }
    return settingsSnapshot(at);
  });
  on("fingerprint:new", (at, event, kinds) => {
    const wanted = Array.isArray(kinds) ? kinds.filter((k) => context.fingerprint.kinds.includes(k)) : context.fingerprint.kinds;
    at.newFingerprint(wanted);
    return settingsSnapshot(at);
  });
  on("shields:set", (at, event, isUp) => { at.setShieldsUp(Boolean(isUp)); windows.applyPrivacySettings(); });
  on("shields:allow", (at, event, site) => { context.shields.setUp(true, String(site)); windows.applyPrivacySettings(); return settingsSnapshot(at); });
  // A new profile, in a window of its own.
  on("profiles:create", (at, event, name) => {
    const trimmed = String(name || "").trim();
    const profile = windows.createProfile(trimmed || `Profile ${context.profiles.all().length + 1}`);
    windows.toast(`“${profile.name}”: a new profile, in its own window`);
    return settingsSnapshot(at);
  });
  // A profile opens in its own window, or its window comes to the front.
  const openProfile = (at, event, id) => {
    const profile = context.profiles.find(String(id));
    if (profile) {
      windows.open(profile);
    }
    return settingsSnapshot(at);
  };
  on("profiles:open", openProfile);
  on("profiles:switch", openProfile);
  // Several profiles at once (the settings, or the ⋯ menu's prompt).
  on("profiles:createMany", (at, event, count, name) => {
    const made = windows.createProfiles(count, name);
    if (made.length) {
      const range = made.length > 1 ? `${made[0].name} to ${made[made.length - 1].name}` : made[0].name;
      at.toast(`${made.length} ${made.length === 1 ? "profile" : "profiles"} made: ${range}` + (windows.warmup.settings().auto ? `, collecting cookies ${made.length === 1 ? "now" : "all at once"}` : ""));
    }
    return settingsSnapshot(at);
  });
  on("profiles:delete", async (at, event, id) => { await at.menus.confirmDeleteProfile(String(id)); return settingsSnapshot(windowOf(event)); });
  on("profiles:deleteAll", async (at) => { await at.menus.confirmDeleteAllProfiles(); return settingsSnapshot(at); });
  on("session:new", (at) => at.menus.confirmNewSession());
  // A profile's collection (the one of the page's window if no id is given).
  const warmup = () => windows.warmup;
  handle("warmup:get", (event, id) => warmup().snapshot(profileFor(id, event).id));
  // The settings as the page has them, saved, and the visits started.
  handle("warmup:save", (event, settings) => {
    warmup().saveSettings(settings && typeof settings === "object" ? settings : {});
    return warmup().snapshot(profileFor(null, event).id);
  });
  handle("warmup:start", (event, settings, id) => {
    if (settings && typeof settings === "object") {
      warmup().saveSettings(settings);
    }
    return warmup().start(null, profileFor(id, event));
  });
  handle("warmup:stop", (event, id) => warmup().stop(profileFor(id, event).id));
  // Every profile at once (as many as the settings say, the others
  // waiting their turn).
  handle("warmup:startAll", async (event) => {
    await warmup().startMany(context.profiles.all());
    return warmup().snapshot(profileFor(null, event).id);
  });
  handle("warmup:stopAll", (event) => {
    warmup().stopAll();
    return warmup().snapshot(profileFor(null, event).id);
  });
  // The Cookies page: every profile's cookies, by site.
  on("cookies:open", (at) => { at.newTab({ url: COOKIES_URL }); });
  on("cookies:profiles", (at) => ({ profiles: context.profiles.all(), current: at.profile.id }));
  handle("cookies:list", (event, id) => cookies.list(profileFor(id, event)));
  on("cookies:remove", async (at, event, id, site) => {
    const profile = profileFor(id, event);
    const { response } = await dialog.showMessageBox(at.win, {
      type: "warning",
      buttons: ["Cancel", "Delete Cookies"],
      defaultId: 0,
      cancelId: 0,
      message: `Delete the cookies of ${String(site)} in “${profile.name}”?`,
      detail: "The site forgets this profile: you may have to sign in to it again.",
    });
    if (response === 1) {
      await cookies.removeSite(profile, String(site));
    }
    return cookies.list(profile);
  });
  on("cookies:export", async (at, event, id) => {
    const profile = profileFor(id, event);
    const { canceled, filePath } = await dialog.showSaveDialog(at.win, {
      title: `The cookies of “${profile.name}”`,
      defaultPath: `cookies-${profile.name.replace(/[^\w.-]+/g, "-")}.txt`,
      filters: [{ name: "cookies.txt (Netscape)", extensions: ["txt"] }, { name: "JSON", extensions: ["json"] }],
    });
    if (canceled || !filePath) {
      return null;
    }
    const { count, text } = await cookies.exported(profile, /\.json$/i.test(filePath) ? "json" : "txt");
    fs.writeFileSync(filePath, text);
    at.toast(`${count} cookies saved`);
    return { count, file: filePath };
  });
  on("chrome:height", (at, event, height) => at.setChromeHeight(height));
  on("find", (at, event, text, options) => at.find(String(text || ""), options || {}));
  on("find:stop", (at) => at.stopFind());
  handle("stats:reset", () => { context.stats.reset(); windows.pushState(); return context.stats.toJSON(); });
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
  const fingerprint = new Fingerprint(store, profiles, { iphone: IPHONE, android: ANDROID });
  const display = screen.getPrimaryDisplay();
  fingerprint.realScreen = { width: display.size.width, height: display.size.height };
  fingerprint.realScale = display.scaleFactor || 1;
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
  // Links pinned above the favorites, as in the iOS app's "Pin Link".
  const pins = new Bookmarks(path.join(userData, "pins.json"));
  const timezone = new Timezone(store, { forced: process.env.NOOR_TEST_TIMEZONE || null });
  // This computer's fonts (see main/fonts.js); tests give theirs.
  const fonts = new FontList(path.join(userData, "fonts.json"), {
    faces: process.env.NOOR_TEST && process.env.NOOR_TEST_FONTS ? JSON.parse(process.env.NOOR_TEST_FONTS) : null,
  });
  context = { store, profiles, fingerprint, shields, stats, bookmarks, pins, timezone, userData, fonts };
  extensions = new Extensions({ store, userData });

  if (store.get("clearOnQuit", false)) {
    // Every launch is a new session: new fingerprints, and nothing left of
    // any profile's website data.
    fingerprint.newSeeds(fingerprint.kinds);
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

  if (MOBILE) {
    // Each tab is told its device itself (see Tab.emulate).
    context.userAgentOverride = null;
    app.userAgentFallback = mobile.userAgent(fingerprint.iphone());
    Browser.prototype.deviceOverride = deviceOverride;
  } else {
    // What Chromium says of the system, kept for the override of every tab
    // (and from the last launch while it is read again).
    const highEntropy = await probeHighEntropy();
    if (highEntropy && typeof highEntropy === "object") {
      store.set("highEntropy", highEntropy);
    }
    context.userAgentOverride = userAgentOverride(highEntropy || store.get("highEntropy", null));
  }

  // Shared and service workers are held as they start, from now on.
  browserDebugger = new BrowserDebugger({ port: DEBUGGING_PORT, scriptFor: debuggedWorkerScript });
  await browserDebugger.keepConnected().catch(() => false);
  app.on("will-quit", () => browserDebugger.stop());

  Browser.prototype.workerScript = workerScript;
  // A window shown asks for this computer's fonts from its toolbar (a page
  // has to show to be told them; see main/fonts.js); the first run's first
  // pages wait for them (in Noor iPhone and Noor Android too: those a
  // device lacks are hidden, see DEVICE_FONTS).
  Browser.prototype.fontsKnown = (browser) => (context && context.fonts && pageOf(browser.chrome)
    ? context.fonts.whenKnown(pageOf(browser.chrome)) : null);
  Browser.prototype.tabMade = registerTab;
  Browser.prototype.screenFor = screenFor;
  Browser.prototype.extensions = extensions;
  // Each profile's window (see main/windows.js): Noor's icon for the first
  // profile's, and for a pinned profile's button, what starts the app (the
  // portable app's own .exe, not the copy it runs from).
  windows = new Windows(context, {
    makeBrowser: (profile, bounds) => {
      const made = new Browser(context, { profile, windows, bounds });
      made.menus = new Menus(made);
      return made;
    },
    appId: mobile.appId(BUILD),
    executable: app.isPackaged ? process.env.PORTABLE_EXECUTABLE_FILE || process.execPath : null,
    appIcon: mobile.iconPath(BUILD),
    profileIdOfSession: (ses) => sessionProfiles.get(ses) || null,
  });
  extensions.windows = windows;
  windows.warmup = makeWarmup(windows);
  // The profiles open as the app last quit, or the one asked for.
  windows.restore(profileArgument(process.argv));
  Menu.setApplicationMenu(windows.current.menus.application());
  registerIPC();
  // Profiles made new as the app closed collect their cookies now.
  windows.collectPending();
  if (process.env.NOOR_TEST) {
    global.noorTest = {
      // The window in front.
      get browser() {
        return windows.current;
      },
      windows, context, extensions, browserDebugger, mark: LOOKALIKE_MARK, iphone: IPHONE, android: ANDROID, build: BUILD, warmup: windows.warmup, cookies, fingerprintFor,
      // What pages of the profile `id` are shown: its user agent and screen.
      shownOf: (id) => {
        const fingerprint = fingerprintFor(id);
        const screen = MOBILE ? fingerprint.iphone() : fingerprint.screen();
        return { userAgent: MOBILE ? mobile.userAgent(fingerprint.iphone()) : userAgent(), screen: `${screen.width}x${screen.height}` };
      },
    };
  }

  // Noor started again: a profile's window (a pinned profile's button
  // gives --profile=<id>), with the address given in a new tab, or the
  // window in front. (Those that came while this one was starting first.)
  launchedAgain = (argv) => {
    const wanted = profileArgument(argv);
    const profile = wanted ? context.profiles.findBySlot(wanted) : null;
    const target = profile ? windows.open(profile) : windows.current;
    if (!target || target.win.isDestroyed()) {
      return;
    }
    target.bringToFront();
    const url = argv.find((arg) => /^https?:\/\//i.test(arg));
    if (url) {
      target.newTab({ url });
    }
  };
  for (const argv of launchesWhileStarting.splice(0)) {
    launchedAgain(argv);
  }
});

app.on("web-contents-created", (event, webContents) => {
  // Nothing but the tabs' pages opens windows (the tabs set their own handler).
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-attach-webview", (e) => e.preventDefault());
});

app.on("before-quit", () => {
  if (windows) {
    // The windows open now open again at the next launch.
    windows.saveOpen();
    windows.quitting = true;
    for (const w of windows.shown) {
      w.saveTabs();
    }
    if (windows.warmup) {
      windows.warmup.stopAll();
    }
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

/// An error nothing caught, shown to the user. Once the app is up, in a box
/// beside its windows, not in their way: the box Electron shows before
/// that (showErrorBox) holds the whole app until it is closed, so an error
/// in a timer froze Noor, which then couldn't even be closed. One at a
/// time.
let reporting = false;
const report = (error) => {
  const text = String((error && error.stack) || error);
  console.error(text);
  if (process.env.NOOR_TEST) {
    return;
  }
  try {
    if (!app.isReady()) {
      dialog.showErrorBox("Noor", text);
    } else if (!reporting) {
      reporting = true;
      dialog.showMessageBox({ type: "error", title: "Noor", message: "Noor ran into an error", detail: text, buttons: ["OK"], noLink: true })
        .catch(() => {})
        .finally(() => { reporting = false; });
    }
  } catch (e) {
    // Nothing more to do.
  }
};
process.on("uncaughtException", report);
process.on("unhandledRejection", report);
