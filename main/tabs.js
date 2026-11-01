"use strict";
const path = require("path");
const { BaseWindow, WebContentsView, session } = require("electron");
const { History } = require("./history");
const mobile = require("./mobile");
const { START_URL, ERROR_URL, isStartPage, isAppPage, isErrorPage, isWebPage, displayURL, hostOf } = require("./address");
const { storeExtensionID } = require("./crx");
const { iconLook } = require("./profile-icon");

const PRELOAD = path.join(__dirname, "..", "scripts", "preload.js");
const CHROME_PRELOAD = path.join(__dirname, "..", "scripts", "chrome-preload.js");
const CHROME_PARTITION = "persist:noor-chrome";
const CHROME_URL = "noor://app/chrome.html";
/// The window's menus, drawn over it (see Browser.showMenu).
const MENU_URL = "noor://app/menu.html";
/// The isolated world a tab reads its page's canonical link in.
const CANONICAL_WORLD = 1009;
/// What the user does that lets a page open a window (Chrome's "user
/// activation"), and for how long after.
const ACTIVATING_INPUTS = new Set(["mouseDown", "mouseUp", "rawKeyDown", "keyDown", "touchEnd", "gestureTap"]);
const ACTIVATION_MS = 5000;
/// The tab strip and the toolbar, in CSS pixels.
const CHROME_HEIGHT = 86;
/// The room Noor iPhone and Noor Android leave around the device's page, and the shortest
/// its page area gets.
const PHONE_MARGIN = 12;
const MIN_PAGE_HEIGHT = 360;
/// Dark pages: everything inverted, and pictures and videos inverted back.
const NIGHT_CSS = `
  html { filter: invert(1) hue-rotate(180deg) !important; background: #121212 !important; }
  img, video, picture, canvas, svg, iframe, embed, object, [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }
`;

let nextTabId = 1;

/// Whether two addresses are on the same site (host, "www." aside).
const sameSite = (a, b) => {
  const hostA = (hostOf(a) || "").replace(/^www\./, "");
  const hostB = (hostOf(b) || "").replace(/^www\./, "");
  return Boolean(hostA) && (hostA === hostB || hostA.endsWith("." + hostB) || hostB.endsWith("." + hostA));
};

/// A tab: a web view in its profile's partition (or the private one), and
/// what the toolbar shows of it. `webContents`: the page a site opened as a
/// window (see Browser.openWindow), shown in this tab.
class Tab {
  constructor(browser, { isPrivate = false, partition = null, webPreferences = null, opener = null, webContents = null, background = false, profile = null } = {}) {
    this.browser = browser;
    this.id = nextTabId++;
    this.isPrivate = isPrivate;
    /// The profile whose tab this is (a tab nobody sees may be another's
    /// than the profile in use).
    this.profile = profile || browser.profile;
    /// A tab nobody sees (see Browser.backgroundTab and main/warmup.js):
    /// its pages go into no history, open no window and show nothing of
    /// themselves in the toolbar or to the extensions.
    this.background = background;
    this.opener = opener;
    this.title = "";
    this.url = "";
    this.favicon = null;
    this.loading = false;
    this.trackersBlocked = 0;
    /// A page to load when the tab is first shown (a restored tab).
    this.deferredURL = null;
    /// Hosts this tab moved from http:// to https://, to go back if that fails.
    this.upgradedHosts = new Set();
    /// Set when settings changed while the tab wasn't shown.
    this.needsReload = false;
    /// The address the page gives itself (its canonical link), if on the
    /// same site: what a bookmark of it keeps.
    this.canonicalURL = null;
    this.nightKey = null;
    // A page given (one a site opened) is given the tab's settings too: as
    // it comes, Electron runs no preload in it (the protection).
    this.view = new WebContentsView(Object.assign({ webPreferences: webPreferences || browser.webPreferences(partition) }, webContents ? { webContents } : {}));
    this.view.setBackgroundColor("#ffffff");
    if (browser.isMobile && typeof this.view.setBorderRadius === "function") {
      // The device's page, with a screen's rounded corners.
      this.view.setBorderRadius(14);
    }
    this.webContents = this.view.webContents;
    // A page a site opened has its renderer already: its device is told at
    // once (see emulate), with no empty page first.
    this.emulated = Boolean(webContents);
    this.watch();
    this.guardWorkers();
    if (browser.tabMade) {
      browser.tabMade(this);
    }
    this.setTimezone(browser.timezone ? browser.timezone.current : null);
    if (browser.isMobile) {
      this.emulate();
    } else {
      this.showScreen(webContents ? webContents.getURL() : "");
    }
    if (browser.extensions && !background) {
      browser.extensions.tabCreated(this);
    }
  }

  /// The fingerprints this tab's pages show: its profile's.
  get fingerprint() {
    return this.profile.id === this.browser.profile.id ? this.browser.fingerprint : this.browser.fingerprint.forProfile(this.profile);
  }

  /// The time zone this tab's pages see (see main/timezone.js), or null
  /// for the system's: set through the debugging protocol, which reaches
  /// the page's process, its workers included, and holds through
  /// navigations.
  setTimezone(zone) {
    this.timezone = zone || "";
    this.sendTimezone();
  }

  sendTimezone(session) {
    if (!this.debugging) {
      return;
    }
    this.webContents.debugger.sendCommand("Emulation.setTimezoneOverride", { timezoneId: this.timezone || "" }, session).catch(() => {});
  }

  /// Chromium itself shows the tab's page the profile's screen, so CSS (a
  /// media query's device-width) agrees with what scripts read, and the
  /// page's frames of its own site with it; frames of other sites get it
  /// from the protection. Told again as each page starts loading, for the
  /// page at `url` (a sign-in site, or one with its shields down, sees the
  /// real screen; see main.js).
  showScreen(url) {
    if (!this.debugging || !this.browser.screenFor || this.browser.isMobile) {
      return;
    }
    const screen = this.browser.screenFor(url || "", this.fingerprint);
    const shown = screen ? `${screen.width}x${screen.height}` : "";
    if (shown === (this.shownScreen || "")) {
      return;
    }
    this.shownScreen = shown;
    const command = screen
      // A size of 0 and no scale leave the view and the page's layout as
      // they are: only the screen changes.
      ? this.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", {
        width: 0, height: 0, deviceScaleFactor: 0, mobile: false, screenWidth: screen.width, screenHeight: screen.height,
      })
      : this.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride", {});
    command.catch(() => {});
  }

  /// Noor iPhone and Noor Android: Chromium shows the tab's pages as the
  /// profile's device (see main/mobile.js): its page area, pixel density
  /// and screen, as a phone (the page's viewport tag counts, scroll bars
  /// float over it) or, on an iPad shown desktop websites, as a computer,
  /// touch for the mouse (a press is a tap, a drag scrolls, and nothing
  /// hovers), its colors, and the browser's user agent (with Chrome's
  /// client hints on an Android one), language and platform, in this tab
  /// and its session (its workers). Told once, before the tab's first page
  /// (see load), and kept through every page after.
  emulate() {
    if (!this.debugging) {
      this.emulation = Promise.resolve(false);
      return;
    }
    const device = this.fingerprint.iphone();
    const told = this.browser.deviceOverride(device);
    this.device = device;
    this.pageHeight = Math.min(this.pageHeight || device.pageHeight, device.fullHeight);
    this.pageScale = this.pageScale || 1;
    try {
      this.webContents.session.setUserAgent(told.override.userAgent, told.sessionLanguages);
    } catch (error) {
      // The session keeps the agent it had.
    }
    const send = (method, params) => this.webContents.debugger.sendCommand(method, params);
    this.emulation = Promise.all([
      send("Emulation.setDeviceMetricsOverride", mobile.deviceMetrics(device, this.pageHeight, this.pageScale)),
      send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: device.touchPoints || 5 }),
      send("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" }),
      send("Emulation.setEmulatedMedia", { features: [{ name: "color-gamut", value: device.p3 === false ? "srgb" : "p3" }] }),
      send("Network.setUserAgentOverride", told.override),
    ]).then(() => true, () => false);
  }

  /// The height of the device's page area (see Browser.phoneBounds): the
  /// page sees a resize, as on a device whose toolbar shows or hides; and
  /// how big Chromium draws it (an iPad's smaller on a narrow PC screen,
  /// with the same sizes for the page).
  setPageHeight(height, scale = 1) {
    if (!this.device || !this.debugging || (height === this.pageHeight && scale === this.pageScale)) {
      return;
    }
    this.pageHeight = height;
    this.pageScale = scale;
    this.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", mobile.deviceMetrics(this.device, height, scale)).catch(() => {});
  }

  /// A page's dedicated workers start without the preload, so a page could
  /// read the real hardware (or Chromium's brands) there and compare with
  /// its own window. Each worker of this tab, and each worker one of them
  /// makes, is held before its first line, given the protection, and let
  /// go. (Shared and service workers are held through Chromium's own
  /// debugging target, see main/browser-debugger.js.)
  guardWorkers() {
    const wc = this.webContents;
    try {
      wc.debugger.attach("1.3");
    } catch (error) {
      return;
    }
    this.debugging = true;
    wc.debugger.on("detach", () => {
      this.debugging = false;
    });
    // Before anything loads: the user agent with Chrome's brands and the
    // system's details, so every request of this tab (a navigation's
    // too) carries the Sec-CH-UA headers as Chrome's do.
    if (this.browser.userAgentOverride) {
      wc.debugger.sendCommand("Network.setUserAgentOverride", this.browser.userAgentOverride).catch(() => {});
    }
    wc.debugger.on("message", (event, method, params) => {
      if (method !== "Target.attachedToTarget" || !params || !params.targetInfo) {
        return;
      }
      // Everything attached waits for this; only dedicated workers get the
      // script, the rest (frames in other processes, service workers…)
      // just goes on. A frame in another process gets the time zone first.
      const session = params.sessionId;
      const type = params.targetInfo.type;
      const resume = () => wc.debugger.sendCommand("Runtime.runIfWaitingForDebugger", {}, session).catch(() => {});
      if (type === "iframe" && this.timezone) {
        wc.debugger.sendCommand("Emulation.setTimezoneOverride", { timezoneId: this.timezone }, session).then(resume, resume);
        return;
      }
      if (type !== "worker" || !this.browser.workerScript) {
        resume();
        return;
      }
      // The worker's own workers, held as they start too.
      wc.debugger.sendCommand("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, session).catch(() => {});
      this.injectWorker(session).then(resume, resume);
    });
    // A window the page opens is a tab of its own, with its own debugger,
    // and service and shared workers are held from Chromium's own target:
    // held by this one too, each would wait, paused, for it as it starts
    // (where the protection is made).
    wc.debugger.sendCommand("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
      filter: [{ type: "page", exclude: true }, { type: "service_worker", exclude: true }, { type: "shared_worker", exclude: true }, {}],
    }).catch(() => {});
  }

  /// Runs the protection in a held worker before its first line. Given as
  /// the argument of a call, as text, it is compiled as the inspector's own
  /// code (Runtime.callFunctionOn compiles such an argument that way), which
  /// V8 leaves out of stack traces and shows as built-in: nothing of it shows
  /// in a stack the worker's code reads, as nothing of the browser's own
  /// built-ins does. Failing that, it is run as a script, as before.
  async injectWorker(session) {
    const send = (method, params) => this.webContents.debugger.sendCommand(method, params, session);
    const hidden = this.browser.workerScript(this, true);
    if (!hidden) {
      return;
    }
    try {
      const global = await send("Runtime.evaluate", { expression: "globalThis", silent: true });
      const objectId = global && global.result && global.result.objectId;
      if (!objectId) {
        throw new Error("No global");
      }
      try {
        const done = await send("Runtime.callFunctionOn", {
          objectId,
          functionDeclaration: "function () {}",
          arguments: [{ unserializableValue: hidden }],
          silent: true,
        });
        if (done && done.exceptionDetails) {
          throw new Error("Not run");
        }
      } finally {
        send("Runtime.releaseObject", { objectId }).catch(() => {});
      }
    } catch (error) {
      const plain = this.browser.workerScript(this, false);
      if (plain) {
        await send("Runtime.evaluate", { expression: plain, silent: true }).catch(() => {});
      }
    }
  }

  watch() {
    const wc = this.webContents;
    // A page that closes itself (a window a site opened, its work done):
    // its tab goes too. Not as the app closes it, or closes them all.
    wc.once("destroyed", () => {
      if (!this.closing && !this.browser.closing && !this.background) {
        this.browser.close(this);
      }
    });
    wc.on("did-start-loading", () => {
      this.loading = true;
      this.changed();
    });
    wc.on("did-stop-loading", () => {
      this.loading = false;
      this.changed();
    });
    wc.on("did-start-navigation", (details, url, isInPlace, isMainFrame) => {
      const main = typeof details.isMainFrame === "boolean" ? details.isMainFrame : isMainFrame;
      const same = typeof details.isSameDocument === "boolean" ? details.isSameDocument : isInPlace;
      if (main && !same) {
        if (this.pendingURL && (details.url || url) === "about:blank") {
          // The empty page a new tab starts with (see load).
          return;
        }
        this.url = details.url || url;
        this.showScreen(this.url);
        this.title = "";
        this.canonicalURL = null;
        this.trackersBlocked = 0;
        this.changed();
      }
    });
    wc.on("did-navigate", (event, url) => {
      if (this.pendingURL && url === "about:blank") {
        return;
      }
      this.url = url;
      this.visited(url);
      this.changed();
    });
    wc.on("did-navigate-in-page", (event, url, isMainFrame) => {
      if (isMainFrame) {
        this.url = url;
        this.visited(url);
        this.changed();
      }
    });
    wc.on("page-title-updated", (event, title) => {
      this.title = title;
      if (!this.isPrivate && !this.background && isWebPage(this.url)) {
        this.browser.history.updateTitle(title, this.url);
      }
      this.changed();
    });
    wc.on("page-favicon-updated", (event, favicons) => {
      this.favicon = favicons && favicons[0] ? favicons[0] : null;
      this.changed();
    });
    wc.on("will-navigate", (event, url) => {
      const target = (event && event.url) || url;
      const replacement = this.browser.rewrite(target, this);
      if (replacement && replacement !== target) {
        event.preventDefault();
        wc.loadURL(replacement);
      }
    });
    wc.on("did-fail-load", (event, code, description, url, isMainFrame) => this.failed(code, description, url, isMainFrame));
    wc.on("dom-ready", () => {
      if (this.background) {
        return;
      }
      this.browser.applyNightMode(this);
      this.readCanonical();
    });
    if (this.background) {
      // Nothing it opens becomes a window, and no page keeps it from
      // going on to the next.
      wc.setWindowOpenHandler(() => ({ action: "deny" }));
      wc.on("will-prevent-unload", (event) => event.preventDefault());
      return;
    }
    wc.on("context-menu", (event, params) => this.browser.menus.page(this, params));
    wc.on("enter-html-full-screen", () => this.browser.setFullScreen(true));
    wc.on("leave-html-full-screen", () => this.browser.setFullScreen(false));
    wc.on("found-in-page", (event, result) => {
      if (this.browser.selected === this) {
        this.browser.chrome.webContents.send("noor:found", { activeMatchOrdinal: result.activeMatchOrdinal, matches: result.matches });
      }
    });
    // The last time the user acted on the page (a click, a key, a touch):
    // a page opens a window only just after one (see opensWindow).
    this.activatedAt = 0;
    wc.on("input-event", (event, input) => {
      if (input && ACTIVATING_INPUTS.has(input.type)) {
        this.activatedAt = Date.now();
      }
    });
    wc.setWindowOpenHandler((details) => this.browser.openWindow(this, details));
  }

  /// Whether the page may open a window now, as Chrome's popup blocker
  /// lets it: within a few seconds of the user's click, key or touch, one
  /// window for each (the act is used up), never by itself.
  opensWindow() {
    // A test that runs the app with no way to click (tools/smoke-iphone.js)
    // lets its page open windows.
    if (process.env.NOOR_TEST_OPEN_WINDOWS) {
      return true;
    }
    if (Date.now() - this.activatedAt > ACTIVATION_MS) {
      return false;
    }
    this.activatedAt = 0;
    return true;
  }

  changed() {
    if (!this.background) {
      this.browser.pushState();
    }
  }

  /// Reads the page's canonical link, when it points to the same site.
  readCanonical() {
    if (!isWebPage(this.url) || this.webContents.isDestroyed()) {
      this.canonicalURL = null;
      return;
    }
    const code = "(() => { const link = document.querySelector('link[rel=\"canonical\"]'); return link && link.href ? String(link.href) : \"\"; })()";
    // In a world of its own: a page can't see it (a call of the page's
    // querySelector it watches would show a script not its own).
    this.webContents.executeJavaScriptInIsolatedWorld(CANONICAL_WORLD, [{ code }], false).then((href) => {
      this.canonicalURL = isWebPage(href) && sameSite(href, this.url) ? href : null;
      this.changed();
    }).catch(() => {
      this.canonicalURL = null;
    });
  }

  /// What a bookmark of this page keeps: the page's own canonical
  /// address, or the address without tracking codes. The address of the
  /// moment (a sign-up flow's, a campaign's) would bring the page back to
  /// that moment, and tell the site where the visit came from.
  get bookmarkURL() {
    return this.canonicalURL || this.browser.shields.clean(this.url) || this.url;
  }

  visited(url) {
    if (!this.isPrivate && !this.background && isWebPage(url)) {
      this.browser.history.record(url, this.title);
    }
  }

  /// Opens a page, over https:// and without tracking codes when the
  /// shields say so; `referrer`: the page a link to it was on.
  load(url, { referrer = null } = {}) {
    // A page loads once its window is on the screen: before, it would read
    // a window of no size (outerWidth and outerHeight 0), as in a headless
    // browser.
    if (!this.background && this.browser && !this.browser.onScreen) {
      this.url = url;
      this.waitingLoad = { url, referrer };
      if (!this.waitingForWindow) {
        this.waitingForWindow = true;
        Promise.resolve(this.browser.shown).then(() => {
          this.waitingForWindow = false;
          const next = this.waitingLoad;
          this.waitingLoad = null;
          if (next && !this.closing && !this.webContents.isDestroyed()) {
            this.load(next.url, { referrer: next.referrer });
          }
        });
      }
      return;
    }
    this.deferredURL = null;
    this.needsReload = false;
    const target = this.browser.rewrite(url, this) || url;
    const options = referrer ? { httpReferrer: referrer } : undefined;
    this.url = target;
    if (this.browser.isMobile && !this.emulated) {
      // A new tab has no page, and no renderer to tell its iPhone to, until
      // it loads one: an empty one first, then, once Chromium has the
      // iPhone, the page, which is an iPhone's from its first line.
      this.pendingURL = target;
      this.pendingOptions = options;
      if (!this.emulating) {
        this.emulating = true;
        this.webContents.loadURL("about:blank").catch(() => {});
        Promise.resolve(this.emulation).then(() => {
          this.emulated = true;
          // A tab closed meanwhile (a window that closes itself at once)
          // loads nothing more: Chromium ends the app over a page loaded
          // in a closing tab.
          if (!this.closing && !this.webContents.isDestroyed() && this.pendingURL) {
            const next = this.pendingURL;
            this.pendingURL = null;
            this.webContents.loadURL(next, this.pendingOptions).catch(() => {});
          }
        });
      }
      return;
    }
    // A page that doesn't load shows the error page (see failed).
    this.webContents.loadURL(target, options).catch(() => {});
  }

  /// Loads a restored tab's page the first time it is shown, or a tab's
  /// page again after the settings changed.
  loadIfNeeded() {
    if (this.deferredURL) {
      this.load(this.deferredURL);
    } else if (this.needsReload) {
      this.needsReload = false;
      this.reload();
    }
  }

  reload() {
    if (this.deferredURL) {
      this.load(this.deferredURL);
    } else if (this.pendingURL) {
      // Still waiting for its iPhone (see load).
    } else {
      this.webContents.reload();
    }
  }

  stop() {
    this.webContents.stop();
  }

  get navigation() {
    return this.webContents.navigationHistory || null;
  }

  canGoBack() {
    return this.navigation ? this.navigation.canGoBack() : this.webContents.canGoBack();
  }

  canGoForward() {
    return this.navigation ? this.navigation.canGoForward() : this.webContents.canGoForward();
  }

  goBack() {
    if (this.navigation) {
      this.navigation.goBack();
    } else {
      this.webContents.goBack();
    }
  }

  goForward() {
    if (this.navigation) {
      this.navigation.goForward();
    } else {
      this.webContents.goForward();
    }
  }

  /// A page that didn't load: back to http:// for a site this tab moved
  /// to https:// and that doesn't answer there, or the error page.
  failed(code, description, url, isMainFrame) {
    if (!isMainFrame || code === -3 || !url) {
      return;
    }
    const host = hostOf(url);
    const connectionError = code === -2 || code === -7 || (code <= -100 && code > -300);
    if (/^https:/i.test(url) && host && this.upgradedHosts.has(host) && connectionError) {
      this.upgradedHosts.delete(host);
      this.browser.shields.httpOnlyHosts.add(host);
      this.webContents.loadURL(url.replace(/^https:/i, "http:"));
      return;
    }
    if (isAppPage(url) || this.background) {
      return;
    }
    const page = new URL(ERROR_URL);
    page.searchParams.set("url", url);
    page.searchParams.set("message", description || "");
    page.searchParams.set("code", String(code));
    this.webContents.loadURL(page.toString());
  }

  close() {
    this.closing = true;
    if (!this.webContents.isDestroyed()) {
      this.webContents.close();
    }
  }

  get isBlank() {
    return isStartPage(this.url);
  }

  /// What the tab strip and the toolbar show.
  state(isActive) {
    const shown = displayURL(this.url);
    return {
      id: this.id,
      title: this.title || (shown ? hostOf(shown) || shown : (this.isPrivate ? "Private tab" : "New Tab")),
      url: shown,
      favicon: this.favicon,
      loading: this.loading,
      isPrivate: this.isPrivate,
      active: Boolean(isActive),
      isBlank: this.isBlank,
    };
  }
}

/// A window of the browser: the profile it shows (each profile has a
/// window of its own, see main/windows.js), its tabs, normal and private,
/// which one is shown, and what the tabs share.
class Browser {
  /// `profile`: the profile it shows (the one used last if none);
  /// `windows`: the app's windows; `bounds`: where it goes.
  constructor(context, { profile = null, windows = null, bounds = null } = {}) {
    Object.assign(this, context);
    this.windows = windows;
    /// Noor iPhone and Noor Android (see main/mobile.js): the profile's
    /// device in every tab.
    this.isMobile = Boolean(this.fingerprint && this.fingerprint.mobileMode);
    /// The app's name: Noor, Noor iPhone or Noor Android.
    this.product = this.isMobile ? mobile.product(this.fingerprint.mobileBuild) : "Noor";
    this.profile = profile || this.profiles.current();
    /// The fingerprints of this window's profile, whichever window is in front.
    this.baseFingerprint = this.fingerprint;
    this.fingerprint = this.baseFingerprint.forProfile(this.profile);
    this.history = this.openHistory(this.profile);
    this.tabs = [];
    this.privateTabs = [];
    /// Tabs nobody sees (see backgroundTab).
    this.backgroundTabs = [];
    this.selected = null;
    this.fullScreen = false;
    this.chromeHeight = CHROME_HEIGHT;
    this.stateTimer = null;
    this.appliedSignature = "";
    /// Set as the window closes for good: its profile deleted (see
    /// Windows.deleteProfile), so its tabs aren't kept.
    this.deleting = false;
    /// Settled once the taskbar shows this window as its profile's (see
    /// Windows.dress): the window shows then.
    this.dressing = null;
    /// Whether the window is on the screen yet (see Tab.load).
    this.onScreen = false;
    /// Settled once the window shows.
    this.shown = new Promise((resolve) => {
      this.markShown = () => {
        this.onScreen = true;
        resolve();
      };
    });
    /// The menu open (see showMenu): what it is made from, where its button
    /// is, and what its items do.
    this.menu = null;
    this.menuActions = null;
    this.menuShown = false;
    this.overlay = null;
    this.makeWindow(bounds);
    this.restoreTabs();
    this.applyPrivacySettings();
    if (this.timezone) {
      this.timezone.onChange((zone) => {
        if (!this.closed) {
          this.applyTimezone(zone);
        }
      });
    }
  }

  /// Every tab's pages see `zone` (null: the system's) from now on.
  applyTimezone(zone) {
    for (const tab of this.allTabs.concat(this.backgroundTabs)) {
      tab.setTimezone(zone);
    }
  }

  // MARK: - Settings

  clearOnQuit() {
    return Boolean(this.store.get("clearOnQuit", false));
  }

  get nightMode() {
    return Boolean(this.store.get("nightMode", false));
  }

  get searchEngine() {
    return this.store.get("searchEngine", "google");
  }

  webPreferences(partition) {
    return {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: false,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true,
      partition,
      spellcheck: false,
    };
  }

  /// The partition of the profile's normal tabs (on disk, or in memory
  /// with Clear Everything on Quit) or of its private tabs (in memory).
  partitionFor(isPrivate, profile = this.profile) {
    return isPrivate ? `noor-private-${profile.id}` : this.profiles.partition(profile, this.clearOnQuit());
  }

  openHistory(profile) {
    return new History(path.join(this.userData, this.profiles.historyFile(profile)));
  }

  /// What the tabs of a device are told (see main.js): the user agent
  /// override for the debugging protocol, and the languages for the
  /// session. Set by main.js; this one for tests.
  deviceOverride(device) {
    return { override: { userAgent: mobile.userAgent(device), platform: device.platform }, sessionLanguages: "en-US" };
  }

  // MARK: - Window

  /// A device's window (Noor iPhone's, Noor Android's) fits its page under
  /// the toolbar (a phone's in a window as wide as the toolbar needs, a
  /// tablet's in one as wide as its page).
  windowSize() {
    if (!this.isMobile) {
      return { width: 1280, height: 860 };
    }
    const device = this.fingerprint.iphone();
    let work = { width: 1280, height: 1000 };
    try {
      work = require("electron").screen.getPrimaryDisplay().workAreaSize;
    } catch (error) {}
    const height = Math.min(work.height - 16, CHROME_HEIGHT + device.pageHeight + 2 * PHONE_MARGIN + 40);
    const width = Math.max(760, device.pageWidth + 2 * PHONE_MARGIN + 40);
    return { width: Math.min(work.width - 16, width), height: Math.max(560, height) };
  }

  /// A device's window: where a window opens next to another (`bounds`, see
  /// Windows.nextBounds), as big as its own device's page needs, not as the
  /// other (an iPad's page is wider than an iPhone's), all of it on that
  /// screen.
  ownBounds(bounds) {
    const size = this.windowSize();
    let area = null;
    try {
      area = require("electron").screen.getDisplayMatching(bounds).workArea;
    } catch (error) {
      area = null;
    }
    if (!area) {
      return { x: bounds.x, y: bounds.y, width: size.width, height: size.height };
    }
    const x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - size.width));
    const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - size.height));
    return { x, y, width: size.width, height: size.height };
  }

  makeWindow(given = null) {
    const bounds = given && this.isMobile ? this.ownBounds(given) : given;
    const size = bounds || this.windowSize();
    this.win = new BaseWindow({
      width: size.width,
      height: size.height,
      ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
      minWidth: this.isMobile ? 480 : 640,
      minHeight: this.isMobile ? CHROME_HEIGHT + MIN_PAGE_HEIGHT + 2 * PHONE_MARGIN + 30 : 420,
      title: this.product,
      backgroundColor: "#f6f5f1",
      show: false,
      icon: path.join(__dirname, "..", "build", "icon.ico"),
    });
    this.win.setMenuBarVisibility(false);
    // The toolbar: the app's own page, with a preload of its own that
    // brings the extensions' buttons (which needs Node's require, so no
    // sandbox; the page is the app's).
    this.chrome = new WebContentsView({ webPreferences: { preload: CHROME_PRELOAD, sandbox: false, contextIsolation: false, nodeIntegration: false, partition: CHROME_PARTITION, spellcheck: false } });
    this.chrome.setBackgroundColor("#f6f5f1");
    this.win.contentView.addChildView(this.chrome);
    this.chrome.webContents.loadURL(CHROME_URL);
    // Shown once the taskbar has it as its profile's (its icon, see
    // Windows.dress), or after a moment anyway: Noor's as big as the screen
    // (a device's as big as its page); a window that isn't the one in
    // front by then (one of several opened together) doesn't take the front.
    this.chrome.webContents.once("did-finish-load", () => {
      const dressed = Promise.resolve(this.dressing);
      Promise.race([dressed, new Promise((resolve) => setTimeout(resolve, 800))]).then(() => {
        if (!this.win.isDestroyed()) {
          const inFront = !(this.windows && this.windows.current && this.windows.current !== this);
          if (!this.isMobile) {
            // Shows it too, in front or not.
            this.win.maximize();
            if (inFront) {
              this.win.focus();
            }
          } else if (inFront) {
            this.win.show();
          } else {
            this.win.showInactive();
          }
          this.pushState();
        }
        // The toolbar, shown now, asks for this computer's fonts (see
        // main/fonts.js): the pages wait for them the first time.
        let known = null;
        try {
          known = !this.win.isDestroyed() && this.fontsKnown ? this.fontsKnown(this) : null;
        } catch (error) {
          known = null;
        }
        Promise.resolve(known).then(() => this.markShown(), () => this.markShown());
      });
    });
    this.chrome.webContents.on("did-finish-load", () => this.pushState());
    this.chrome.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.chrome.webContents.on("will-navigate", (event) => event.preventDefault());
    for (const event of ["resize", "maximize", "unmaximize", "enter-full-screen", "leave-full-screen", "restore"]) {
      this.win.on(event, () => {
        this.hideMenu();
        this.layout();
      });
    }
    // A menu closes as the window loses the front, as Chrome's do.
    for (const event of ["blur", "minimize"]) {
      this.win.on(event, () => this.hideMenu());
    }
    this.win.on("focus", () => {
      if (this.windows) {
        this.windows.focused(this);
      }
    });
    this.win.on("close", () => {
      if (!this.deleting) {
        this.saveTabs();
      }
      // What closes with the window isn't closed by its pages.
      this.closing = true;
      // Its tabs nobody sees go on in another window.
      if (this.windows) {
        this.windows.closing(this);
      }
    });
    this.win.on("closed", () => {
      this.closed = true;
      for (const tab of this.allTabs.concat(this.backgroundTabs)) {
        tab.close();
      }
      for (const view of [this.chrome, this.overlay]) {
        try {
          if (view && !view.webContents.isDestroyed()) {
            view.webContents.close();
          }
        } catch (error) {
          // Gone with the window.
        }
      }
      if (this.windows) {
        this.windows.closed(this);
      }
    });
    this.layout();
  }

  // MARK: - Menus

  /// Shows a menu as Chrome draws its own (the ⋯ menu, the profile's, the
  /// shields'): a page over the whole window (renderer/menu.html) with the
  /// items `build` makes, under `anchor` (its button, in the window's
  /// pixels), lined up by `align` ("end", "start" or "center"). An item
  /// chosen runs its `click`; one with `keepOpen` (the zoom, a switch) leaves
  /// the menu open, made again. A click outside closes it.
  showMenu(build, anchor = null, align = "end") {
    if (this.win.isDestroyed() || this.closing) {
      return;
    }
    this.menu = { build, anchor, align };
    this.renderMenu(false);
  }

  /// The page menus are drawn on, made once: transparent, so the window
  /// shows through around the menu.
  menuOverlay() {
    if (this.overlay && !this.overlay.webContents.isDestroyed()) {
      return this.overlay;
    }
    this.overlay = new WebContentsView({ webPreferences: { preload: CHROME_PRELOAD, sandbox: false, contextIsolation: false, nodeIntegration: false, partition: CHROME_PARTITION, spellcheck: false } });
    this.overlay.setBackgroundColor("#00000000");
    this.overlay.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.overlay.webContents.on("will-navigate", (event) => event.preventDefault());
    this.overlayReady = new Promise((resolve) => this.overlay.webContents.once("did-finish-load", resolve));
    this.overlay.webContents.loadURL(MENU_URL);
    return this.overlay;
  }

  renderMenu(update) {
    if (!this.menu || this.win.isDestroyed()) {
      return;
    }
    const { items, actions } = serializeMenu(this.menu.build());
    this.menuActions = actions;
    const overlay = this.menuOverlay();
    const { width, height } = this.win.getContentBounds();
    overlay.setBounds({ x: 0, y: 0, width, height });
    if (!this.menuShown) {
      this.win.contentView.addChildView(overlay);
      this.menuShown = true;
    }
    const menu = { items, anchor: this.menu.anchor, align: this.menu.align, update, private: Boolean(this.selected && this.selected.isPrivate) };
    this.overlayReady.then(() => {
      if (this.menuShown && this.overlay === overlay && !overlay.webContents.isDestroyed()) {
        overlay.webContents.send("noor:menu", menu);
        overlay.webContents.focus();
      }
    });
  }

  /// What the menu's item `id` does.
  chooseMenu(id) {
    const action = this.menuActions && this.menuActions.get(id);
    if (!action) {
      return;
    }
    if (!action.keepOpen) {
      this.hideMenu();
    }
    try {
      action.click();
    } finally {
      if (action.keepOpen && this.menuShown) {
        this.renderMenu(true);
      }
    }
  }

  hideMenu() {
    if (!this.menuShown) {
      return;
    }
    this.menuShown = false;
    this.menu = null;
    this.menuActions = null;
    try {
      if (!this.win.isDestroyed()) {
        this.win.contentView.removeChildView(this.overlay);
      }
    } catch (error) {
      // The window is going.
    }
    if (this.selected && !this.selected.webContents.isDestroyed()) {
      this.selected.webContents.focus();
    }
  }

  /// Prints the shown page (the system's print dialog).
  print() {
    const tab = this.selected;
    if (tab && !tab.webContents.isDestroyed() && isWebPage(tab.url)) {
      tab.webContents.print({ printBackground: true }, () => {});
    }
  }

  /// Shows the window in front of the others.
  bringToFront() {
    if (this.win.isDestroyed()) {
      return;
    }
    if (this.win.isMinimized()) {
      this.win.restore();
    }
    this.win.show();
    this.win.focus();
  }

  /// Takes a tab nobody sees from a window closing (see Windows.closing):
  /// its pages go on here, under this window's shown tab.
  adopt(tab, from) {
    from.backgroundTabs = from.backgroundTabs.filter((t) => t !== tab);
    try {
      if (!from.win.isDestroyed()) {
        from.win.contentView.removeChildView(tab.view);
      }
    } catch (error) {
      // The window is going.
    }
    tab.browser = this;
    this.backgroundTabs.push(tab);
    this.win.contentView.addChildView(tab.view, 0);
    this.layout();
  }

  layout() {
    if (!this.win || this.win.isDestroyed()) {
      return;
    }
    const { width, height } = this.win.getContentBounds();
    const top = this.fullScreen ? 0 : this.chromeHeight;
    this.chrome.setBounds({ x: 0, y: 0, width, height: top });
    const area = { x: 0, y: top, width, height: Math.max(0, height - top) };
    let shown = null;
    if (this.selected) {
      shown = this.isMobile ? this.phoneBounds(this.selected, width, height, top) : area;
      this.selected.view.setBounds(shown);
    }
    // Where the shown tab is, under it, so no edge of one shows; another
    // profile's iPhone keeps the page area of its own (see Tab.emulate).
    // The tabs out of sight have the shown one's size, as in Chrome.
    for (const tab of this.backgroundTabs.concat(this.allTabs)) {
      if (tab !== this.selected && (tab.background || tab.attached)) {
        tab.view.setBounds(shown || area);
      }
    }
  }

  /// Where a device's build draws a tab's page: the device's page area, at its
  /// size (a CSS pixel to a pixel of the PC's), in the middle under the
  /// toolbar; on a screen too short for it, as tall as fits (see
  /// Tab.setPageHeight), and the whole screen's height for a video or page
  /// shown full screen. An iPad's page on a window too narrow for it is
  /// drawn smaller, to fit.
  phoneBounds(tab, width, height, top) {
    const device = tab.device || this.fingerprint.iphone();
    const margin = this.fullScreen ? 0 : PHONE_MARGIN;
    const scale = Math.min(1, Math.max(0.25, Math.floor(((width - 2 * margin) / device.pageWidth) * 100) / 100));
    const room = Math.max(MIN_PAGE_HEIGHT, Math.floor((height - top - 2 * margin) / scale));
    const pageHeight = Math.min(this.fullScreen ? device.fullHeight : device.pageHeight, room);
    tab.setPageHeight(pageHeight, scale);
    const shownWidth = Math.round(device.pageWidth * scale);
    const shownHeight = Math.round(pageHeight * scale);
    return { x: Math.max(0, Math.round((width - shownWidth) / 2)), y: top + Math.max(0, Math.round((height - top - shownHeight) / 2)), width: shownWidth, height: shownHeight };
  }

  /// A new iPhone or iPad for the profile: every tab and the profile's
  /// sessions are told it, and the pages load again with it. A window too
  /// small for its page (an iPhone's, now an iPad's) grows to fit it.
  applyDevice() {
    for (const tab of this.allTabs.concat(this.backgroundTabs)) {
      if (!tab.webContents.isDestroyed()) {
        tab.emulate();
      }
    }
    try {
      require("electron").app.userAgentFallback = mobile.userAgent(this.fingerprint.iphone());
    } catch (error) {}
    if (this.win && !this.win.isDestroyed() && !this.win.isMaximized() && !this.win.isFullScreen()) {
      const wanted = this.windowSize();
      const [width, height] = this.win.getSize();
      if (width < wanted.width || height < wanted.height) {
        this.win.setSize(Math.max(width, wanted.width), Math.max(height, wanted.height));
      }
    }
    this.layout();
  }

  setFullScreen(isOn) {
    this.fullScreen = isOn;
    if (this.win.isFullScreen() !== isOn) {
      this.win.setFullScreen(isOn);
    }
    this.layout();
  }

  /// The toolbar page grows for its find bar or a prompt and shrinks back.
  setChromeHeight(height) {
    this.chromeHeight = Math.max(CHROME_HEIGHT, Math.min(400, Number(height) || CHROME_HEIGHT));
    this.layout();
  }

  find(text, { forward = true, findNext = false } = {}) {
    if (!this.selected) {
      return;
    }
    if (!text) {
      this.selected.webContents.stopFindInPage("clearSelection");
      return;
    }
    this.selected.webContents.findInPage(text, { forward, findNext });
  }

  stopFind() {
    if (this.selected) {
      this.selected.webContents.stopFindInPage("clearSelection");
      this.selected.webContents.focus();
    }
  }

  focusAddressBar() {
    this.chrome.webContents.focus();
    this.chrome.webContents.send("noor:focus-address");
  }

  /// A line shown a moment in the toolbar (once it has loaded: a window
  /// just opened is told too).
  toast(message) {
    const wc = this.chrome.webContents;
    if (wc.isDestroyed()) {
      return;
    }
    if (wc.isLoading() || wc.getURL() !== CHROME_URL) {
      wc.once("did-finish-load", () => {
        if (!wc.isDestroyed()) {
          wc.send("noor:toast", message);
        }
      });
      return;
    }
    wc.send("noor:toast", message);
  }

  /// Asks the toolbar page for a line of text; it answers with `action`.
  prompt(options) {
    this.chrome.webContents.send("noor:prompt", options);
  }

  // MARK: - Tabs

  get allTabs() {
    return this.tabs.concat(this.privateTabs);
  }

  tabFor(webContents) {
    if (!webContents) {
      return null;
    }
    return this.allTabs.find((tab) => tab.webContents === webContents || tab.webContents.id === webContents.id) || null;
  }

  tabWithId(id) {
    return this.allTabs.find((tab) => tab.id === id) || null;
  }

  startURL(isPrivate) {
    return START_URL + (isPrivate ? "?private=1" : "");
  }

  /// Opens a new tab, empty (the start page) or loading `url`.
  newTab({ isPrivate = false, url = null, after = this.selected, select = true } = {}) {
    const tab = new Tab(this, { isPrivate, partition: this.partitionFor(isPrivate) });
    this.insert(tab, after && after.isPrivate === isPrivate ? after : null);
    if (select || !this.selected) {
      this.select(tab);
    }
    tab.load(url || this.startURL(isPrivate));
    this.pushState();
    this.saveTabs();
    return tab;
  }

  insert(tab, after) {
    const list = tab.isPrivate ? this.privateTabs : this.tabs;
    const index = after ? list.indexOf(after) + 1 : list.length;
    list.splice(index > 0 ? index : list.length, 0, tab);
    this.attach(tab);
  }

  /// Keeps a tab's page in the window, out of sight unless it is the one
  /// shown, as Chrome keeps its tabs: a page in no window has no window to
  /// read, its window.outerWidth and outerHeight 0, as in a headless
  /// browser, where a page in a tab of Chrome's in the background reads its
  /// window's (and is hidden, as here).
  attach(tab) {
    if (tab.attached || !this.win || this.win.isDestroyed() || tab.webContents.isDestroyed()) {
      return;
    }
    tab.view.setVisible(tab === this.selected);
    this.win.contentView.addChildView(tab.view, 0);
    tab.attached = true;
    this.layout();
  }

  detach(tab) {
    if (!tab.attached) {
      return;
    }
    tab.attached = false;
    try {
      if (this.win && !this.win.isDestroyed()) {
        this.win.contentView.removeChildView(tab.view);
      }
    } catch (error) {
      // The window is going.
    }
  }

  /// A window a page opens (window.open, a link to a new tab) becomes a
  /// tab, as in Chrome: the page Electron makes for it (in the opener's
  /// session, with the protection) is shown in the new tab, so the opener
  /// gets the window back (a sign-in popup talks to it, and the opener
  /// sees it close) and it keeps its opener, unless the page asked for
  /// none (noopener), when the tab loads the address itself. It outlives
  /// its opener, as in Chrome.
  openWindow(opener, details) {
    const { url, disposition } = details;
    if (disposition !== "new-window" && disposition !== "foreground-tab" && disposition !== "background-tab") {
      return { action: "deny" };
    }
    // A window the page opens by itself is blocked, as in Chrome: the
    // page's window.open gets null.
    if (!opener.opensWindow()) {
      return { action: "deny" };
    }
    // The page's session is the opener's.
    const webPreferences = this.webPreferences(this.partitionFor(opener.isPrivate));
    delete webPreferences.partition;
    return {
      action: "allow",
      outlivesOpener: true,
      overrideBrowserWindowOptions: { webPreferences },
      createWindow: (options) => {
        if (!options.webContents) {
          // No page made for it: a tab of our own loads the address.
          setImmediate(() => this.newTab({ isPrivate: opener.isPrivate, url, after: opener, select: disposition !== "background-tab" }));
          return undefined;
        }
        const tab = new Tab(this, { isPrivate: opener.isPrivate, opener, webContents: options.webContents, webPreferences });
        this.insert(tab, opener);
        if (disposition !== "background-tab" || !this.selected) {
          this.select(tab);
        }
        this.pushState();
        this.saveTabs();
        return tab.webContents;
      },
    };
  }

  /// A tab nobody sees, in the profile's normal partition, with what its
  /// tabs have (its fingerprints, its iPhone, the shields, the time zone,
  /// the extensions' scripts), for main/warmup.js: under the shown tab,
  /// where it is, so its pages have a shown page's size and are drawn and
  /// run as a shown tab's are, with no sound and no dialog.
  backgroundTab(profile = this.profile) {
    const partition = this.partitionFor(false, profile);
    const webPreferences = Object.assign(this.webPreferences(partition), { backgroundThrottling: false, disableDialogs: true });
    const tab = new Tab(this, { partition, webPreferences, background: true, profile });
    tab.webContents.setAudioMuted(true);
    this.backgroundTabs.push(tab);
    this.layout();
    this.win.contentView.addChildView(tab.view, 0);
    return tab;
  }

  closeBackgroundTab(tab) {
    this.backgroundTabs = this.backgroundTabs.filter((t) => t !== tab);
    try {
      if (!this.win.isDestroyed()) {
        this.win.contentView.removeChildView(tab.view);
      }
    } catch (error) {
      // The window is going.
    }
    tab.close();
  }

  select(tab) {
    if (!tab || tab === this.selected) {
      if (tab) {
        tab.loadIfNeeded();
      }
      return;
    }
    // Another tab shown (a page opened one) closes the menu, which it would
    // otherwise cover.
    this.hideMenu();
    if (this.selected && !this.selected.webContents.isDestroyed()) {
      // Out of sight, in the window still (see attach).
      this.selected.view.setVisible(false);
    }
    this.selected = tab;
    tab.view.setVisible(true);
    // On top of the others, where it was or not.
    this.win.contentView.addChildView(tab.view);
    tab.attached = true;
    this.layout();
    tab.loadIfNeeded();
    tab.webContents.focus();
    if (this.extensions) {
      this.extensions.tabSelected(tab);
    }
    this.pushState();
    this.saveTabs();
  }

  close(tab) {
    const list = tab.isPrivate ? this.privateTabs : this.tabs;
    const index = list.indexOf(tab);
    if (index < 0) {
      return;
    }
    list.splice(index, 1);
    // The window is going (the app quits): nothing is left to show, and
    // its views can't be touched any more.
    if (this.closing || !this.win || this.win.isDestroyed()) {
      return;
    }
    const wasSelected = this.selected === tab;
    this.detach(tab);
    if (!tab.isPrivate && this.tabs.length === 0) {
      // There is always a normal tab.
      const blank = new Tab(this, { isPrivate: false, partition: this.partitionFor(false) });
      this.insert(blank, null);
      blank.load(this.startURL(false));
    }
    if (wasSelected) {
      this.selected = null;
      let next = null;
      if (tab.opener && list.includes(tab.opener)) {
        next = tab.opener;
      } else if (list.length) {
        next = list[Math.min(index, list.length - 1)];
      } else {
        next = this.tabs[this.tabs.length - 1];
      }
      this.select(next);
    }
    tab.close();
    if (tab.isPrivate && this.privateTabs.length === 0) {
      // Nothing of the private session is kept.
      session.fromPartition(this.partitionFor(true)).clearStorageData().catch(() => {});
    }
    this.pushState();
    this.saveTabs();
  }

  closeOthers(kept) {
    for (const tab of (kept.isPrivate ? this.privateTabs : this.tabs).slice()) {
      if (tab !== kept) {
        this.close(tab);
      }
    }
  }

  /// Closes every tab, without opening a new one.
  destroyTabs() {
    this.selected = null;
    for (const tab of this.allTabs) {
      this.detach(tab);
      tab.close();
    }
    this.tabs = [];
    this.privateTabs = [];
  }

  selectNext(offset) {
    const list = this.selected && this.selected.isPrivate ? this.privateTabs : this.tabs;
    if (list.length < 2) {
      return;
    }
    const index = list.indexOf(this.selected);
    this.select(list[(index + offset + list.length) % list.length]);
  }

  /// Remembers the open normal tabs for the next launch (per profile),
  /// unless Clear Everything on Quit is on.
  saveTabs() {
    const key = this.profiles.key("openTabs", this.profile);
    if (this.clearOnQuit()) {
      this.store.delete(key);
      return;
    }
    const saved = this.tabs
      .map((tab) => ({ url: tab.deferredURL || tab.url, title: tab.title }))
      .filter((tab) => isWebPage(tab.url) || isStartPage(tab.url) || isAppPage(tab.url))
      .filter((tab) => !isErrorPage(tab.url));
    this.store.set(key, saved);
    const selected = this.tabs.indexOf(this.selected);
    this.store.set(this.profiles.key("selectedTab", this.profile), selected >= 0 ? selected : saved.length - 1);
  }

  restoreTabs() {
    let saved = this.store.get(this.profiles.key("openTabs", this.profile), []);
    if (!Array.isArray(saved) || this.clearOnQuit()) {
      saved = [];
    }
    saved = saved.filter((entry) => entry && typeof entry.url === "string");
    for (const entry of saved) {
      const tab = new Tab(this, { isPrivate: false, partition: this.partitionFor(false) });
      tab.deferredURL = entry.url;
      tab.url = entry.url;
      tab.title = entry.title || "";
      this.insert(tab, null);
    }
    if (this.tabs.length === 0) {
      const blank = new Tab(this, { isPrivate: false, partition: this.partitionFor(false) });
      blank.deferredURL = this.startURL(false);
      blank.url = blank.deferredURL;
      this.insert(blank, null);
    }
    const index = this.store.get(this.profiles.key("selectedTab", this.profile), this.tabs.length - 1);
    this.select(this.tabs[Math.max(0, Math.min(Number(index) || 0, this.tabs.length - 1))]);
  }

  // MARK: - Pages

  /// `url` without tracking codes and over https://, when the shields say
  /// so, or null if it is fine as it is.
  rewrite(url, tab) {
    if (!isWebPage(url)) {
      return null;
    }
    const cleaned = this.shields.cleanLinksEnabled() ? this.shields.clean(url) : null;
    const base = cleaned || url;
    let upgraded = null;
    if (this.shields.httpsEnabled() && this.shields.areUp(base)) {
      upgraded = this.shields.upgraded(base);
      if (upgraded) {
        if (tab) {
          tab.upgradedHosts.add(hostOf(base));
        }
        this.stats.connectionUpgraded();
      }
    }
    return upgraded || cleaned;
  }

  /// What the user typed in the address bar: opens it in `tab`, and gives
  /// the page the keys, as Chrome does on Enter. Left in the address bar,
  /// the page would load in a window in front without them
  /// (document.hasFocus() false), as only a browser a program drives shows
  /// it, which bot checks look for.
  go(text, tab = this.selected) {
    const { resolve } = require("./address");
    const url = resolve(text, this.searchEngine);
    if (url && tab) {
      tab.load(url);
      if (tab === this.selected && !tab.webContents.isDestroyed()) {
        tab.webContents.focus();
      }
    }
  }

  /// Bookmarks the shown page (its canonical address, see Tab.bookmarkURL),
  /// or takes its bookmark away. Whether it is bookmarked now.
  toggleBookmark() {
    const tab = this.selected;
    if (!tab || !isWebPage(tab.url)) {
      return false;
    }
    const url = tab.bookmarkURL;
    const saved = this.bookmarks.contains(tab.url) && url !== tab.url
      ? (this.bookmarks.remove(tab.url), false)
      : this.bookmarks.toggle(tab.title, url);
    this.toast(saved ? "Bookmark added" : "Bookmark removed");
    if (this.windows) {
      this.windows.pushState();
    } else {
      this.pushState();
    }
    return saved;
  }

  findOnPage() {
    this.chrome.webContents.focus();
    this.chrome.webContents.send("noor:find");
  }

  trackerBlocked(webContents) {
    const tab = this.tabFor(webContents);
    if (tab) {
      tab.trackersBlocked += 1;
    }
    this.stats.trackerBlocked();
    this.pushState();
  }

  applyNightMode(tab) {
    if (tab.webContents.isDestroyed() || isAppPage(tab.url)) {
      return;
    }
    if (this.nightMode) {
      tab.webContents.insertCSS(NIGHT_CSS).then((key) => { tab.nightKey = key; }).catch(() => {});
    }
  }

  /// Night mode on or off in this window's tabs (see Windows.setNightMode).
  setNightMode(isOn) {
    for (const tab of this.allTabs) {
      if (tab.webContents.isDestroyed()) {
        continue;
      }
      if (isOn) {
        this.applyNightMode(tab);
      } else if (tab.nightKey) {
        tab.webContents.removeInsertedCSS(tab.nightKey).catch(() => {});
        tab.nightKey = null;
      }
    }
    this.pushState();
  }

  // MARK: - Privacy settings

  privacySignature() {
    return [
      this.fingerprint.signature(),
      this.shields.trackersEnabled(), this.shields.httpsEnabled(), this.shields.cleanLinksEnabled(),
      this.shields.downSites().join(","),
    ].join("|");
  }

  /// Pages pick up changed settings when they next load: the shown tab now,
  /// the others when shown.
  applyPrivacySettings({ reload = true } = {}) {
    const signature = this.privacySignature();
    if (signature === this.appliedSignature) {
      return;
    }
    const first = this.appliedSignature === "";
    this.appliedSignature = signature;
    if (first || !reload) {
      return;
    }
    for (const tab of this.allTabs) {
      if (tab !== this.selected && !tab.isBlank) {
        tab.needsReload = true;
      }
    }
    if (this.selected && !this.selected.isBlank) {
      this.selected.reload();
    }
    this.pushState();
  }

  /// The profile becomes a device of the kind `family` (a new one), in
  /// every tab, and the pages load again with it.
  setDeviceFamily(family) {
    this.fingerprint.setFamily(family);
    this.applyDevice();
    this.applyPrivacySettings();
  }

  /// Gives every site new values for `kinds` and reloads the page with them.
  newFingerprint(kinds) {
    this.fingerprint.newSeeds(kinds);
    if (this.isMobile && kinds.includes("device")) {
      this.applyDevice();
    }
    this.applyPrivacySettings();
  }

  /// Turns shields up or down for the shown tab's site and reloads it.
  setShieldsUp(isUp) {
    const site = this.selected && require("./shields").Shields.site(this.selected.url);
    if (!site) {
      return;
    }
    this.shields.setUp(isUp, site);
    this.applyPrivacySettings();
  }

  // MARK: - Profiles

  /// Shows another profile in this window: closes every tab and opens the
  /// profile's remembered tabs, with its website data, history and
  /// fingerprints. A profile open in another window is shown there.
  switchProfile(id) {
    const profile = this.profiles.find(id);
    if (!profile || profile.id === this.profile.id) {
      return;
    }
    const shown = this.windows && this.windows.forProfile(profile.id);
    if (shown && shown !== this) {
      this.windows.open(profile);
      return;
    }
    this.saveTabs();
    this.destroyTabs();
    this.profiles.select(id);
    this.profile = profile;
    this.fingerprint = this.baseFingerprint.forProfile(profile);
    this.shields.httpOnlyHosts.clear();
    this.history = this.openHistory(profile);
    this.restoreTabs();
    this.applyPrivacySettings({ reload: false });
    if (this.windows) {
      this.windows.dress(this);
      this.windows.saveOpen();
      this.windows.pushState();
    }
    this.pushState();
  }

  /// A new profile, in a window of its own (see Windows.createProfile).
  createProfile(name) {
    return this.windows.createProfile(name);
  }

  /// `count` new profiles at once (see Windows.createProfiles).
  createProfiles(count, name) {
    return this.windows.createProfiles(count, name);
  }

  /// Deletes a profile with everything it kept (see Windows.deleteProfile).
  deleteProfile(id) {
    return this.windows.deleteProfile(id);
  }

  deleteAllProfiles() {
    return this.windows.deleteAllProfiles();
  }

  clearData(profile) {
    return this.windows.clearData(profile);
  }

  // MARK: - New session

  /// Deletes the cookies, website data and history of the profile in use,
  /// closes every tab, gives every site new fingerprints in that profile
  /// and opens an empty tab. Other profiles and bookmarks are kept.
  async startNewSession() {
    const warmup = this.windows && this.windows.warmup;
    if (warmup) {
      warmup.stop(this.profile.id);
    }
    this.destroyTabs();
    this.shields.httpOnlyHosts.clear();
    this.history.clear();
    this.fingerprint.newSeeds(this.fingerprint.kinds);
    this.appliedSignature = this.privacySignature();
    await this.clearData(this.profile);
    this.newTab();
    this.toast("New session started");
  }

  // MARK: - State for the toolbar

  state() {
    const active = this.selected;
    const url = active ? displayURL(active.url) : "";
    const { Shields } = require("./shields");
    const site = Shields.site(url);
    return {
      tabs: this.tabs.concat(this.privateTabs).map((tab) => tab.state(tab === active)),
      activeId: active ? active.id : null,
      isPrivate: Boolean(active && active.isPrivate),
      canGoBack: Boolean(active && active.canGoBack()),
      canGoForward: Boolean(active && active.canGoForward()),
      loading: Boolean(active && active.loading),
      url,
      site,
      shieldsUp: site ? this.shields.areUp(url) : true,
      trackersBlocked: active ? active.trackersBlocked : 0,
      bookmarked: Boolean(url && (this.bookmarks.contains(url) || this.bookmarks.contains(active.bookmarkURL))),
      profile: { id: this.profile.id, name: this.profile.name, color: this.profile.isDefault ? null : iconLook(this.profile.name).colors[0] },
      profiles: this.profiles.all(),
      stats: this.stats.toJSON(),
      nightMode: this.nightMode,
      // For the extensions' buttons: the session they are in, the tab they
      // show, and whether extensions run there (not where nothing is kept
      // on disk). On a store page, the extension it shows.
      partition: this.partitionFor(Boolean(active && active.isPrivate)),
      activeWebContentsId: active && !active.webContents.isDestroyed() ? active.webContents.id : null,
      extensionsHere: Boolean(this.extensions && active && !active.webContents.isDestroyed() && active.webContents.session.isPersistent()),
      storeExtension: (() => {
        const id = this.extensions && active ? storeExtensionID(active.url) : null;
        return id ? { id, installed: this.extensions.isInstalled(id), installing: this.extensions.isInstalling(id) } : null;
      })(),
    };
  }

  pushState() {
    if (this.stateTimer) {
      return;
    }
    this.stateTimer = setImmediate(() => {
      this.stateTimer = null;
      if (this.chrome && !this.chrome.webContents.isDestroyed()) {
        this.chrome.webContents.send("noor:state", this.state());
      }
    });
  }
}

/// A menu's items as the menu page gets them: each `click` (and each of a
/// row's `actions`, the zoom's buttons) kept here under an id the page sends
/// back when it is chosen.
const serializeMenu = (items) => {
  const actions = new Map();
  let next = 0;
  const keep = (click, keepOpen) => {
    const id = `m${next++}`;
    actions.set(id, { click, keepOpen: Boolean(keepOpen) });
    return id;
  };
  const walk = (list) => (Array.isArray(list) ? list : []).filter(Boolean).map((item) => {
    const out = { ...item };
    delete out.click;
    delete out.actions;
    delete out.keepOpen;
    if (typeof item.click === "function") {
      out.id = keep(item.click, item.keepOpen);
    }
    if (item.actions && typeof item.actions === "object") {
      out.ids = {};
      for (const [name, action] of Object.entries(item.actions)) {
        if (typeof action === "function") {
          out.ids[name] = keep(action, true);
        } else if (action && typeof action.click === "function") {
          out.ids[name] = keep(action.click, action.keepOpen !== false);
        }
      }
    }
    if (item.submenu) {
      out.submenu = walk(item.submenu);
    }
    return out;
  });
  return { items: walk(items), actions };
};

module.exports = { Browser, Tab, CHROME_HEIGHT, PRELOAD, CHROME_PARTITION, serializeMenu };
