"use strict";
const path = require("path");
const fs = require("fs");
const { BaseWindow, WebContentsView, session } = require("electron");
const { History } = require("./history");
const { KINDS } = require("./fingerprint");
const { DEFAULT_ID } = require("./profiles");
const { START_URL, ERROR_URL, isStartPage, isAppPage, isErrorPage, isWebPage, displayURL, hostOf } = require("./address");

const PRELOAD = path.join(__dirname, "..", "scripts", "preload.js");
const CHROME_URL = "noor://app/chrome.html";
/// The tab strip and the toolbar, in CSS pixels.
const CHROME_HEIGHT = 86;
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
/// what the toolbar shows of it.
class Tab {
  constructor(browser, { isPrivate = false, partition = null, webPreferences = null, opener = null } = {}) {
    this.browser = browser;
    this.id = nextTabId++;
    this.isPrivate = isPrivate;
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
    this.view = new WebContentsView({ webPreferences: webPreferences || browser.webPreferences(partition) });
    this.view.setBackgroundColor("#ffffff");
    this.webContents = this.view.webContents;
    this.watch();
    this.guardWorkers();
    this.setTimezone(browser.timezone ? browser.timezone.current : null);
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

  /// A page's dedicated workers start without the preload, so a page could
  /// read the real hardware (or Chromium's brands) there and compare with
  /// its own window. Each worker of this tab is held before its first line,
  /// given the protection, and let go. (Service workers get theirs from a
  /// preload of their own, see main.js; shared workers can't be reached.)
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
      const script = type === "worker" && this.browser.workerScript ? this.browser.workerScript(this) : null;
      if (!script) {
        resume();
        return;
      }
      wc.debugger.sendCommand("Runtime.evaluate", { expression: script, silent: true }, session).then(resume, resume);
    });
    wc.debugger.sendCommand("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }).catch(() => {});
  }

  watch() {
    const wc = this.webContents;
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
        this.url = details.url || url;
        this.title = "";
        this.canonicalURL = null;
        this.trackersBlocked = 0;
        this.changed();
      }
    });
    wc.on("did-navigate", (event, url) => {
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
      if (!this.isPrivate && isWebPage(this.url)) {
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
      this.browser.applyNightMode(this);
      this.readCanonical();
    });
    wc.on("context-menu", (event, params) => this.browser.menus.page(this, params));
    wc.on("enter-html-full-screen", () => this.browser.setFullScreen(true));
    wc.on("leave-html-full-screen", () => this.browser.setFullScreen(false));
    wc.on("found-in-page", (event, result) => {
      if (this.browser.selected === this) {
        this.browser.chrome.webContents.send("noor:found", { activeMatchOrdinal: result.activeMatchOrdinal, matches: result.matches });
      }
    });
    wc.setWindowOpenHandler((details) => this.browser.openWindow(this, details));
  }

  changed() {
    this.browser.pushState();
  }

  /// Reads the page's canonical link, when it points to the same site.
  readCanonical() {
    if (!isWebPage(this.url) || this.webContents.isDestroyed()) {
      this.canonicalURL = null;
      return;
    }
    const code = "(() => { const link = document.querySelector('link[rel=\"canonical\"]'); return link && link.href ? String(link.href) : \"\"; })()";
    this.webContents.executeJavaScript(code, true).then((href) => {
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
    if (!this.isPrivate && isWebPage(url)) {
      this.browser.history.record(url, this.title);
    }
  }

  /// Opens a page, over https:// and without tracking codes when the
  /// shields say so.
  load(url) {
    this.deferredURL = null;
    this.needsReload = false;
    const target = this.browser.rewrite(url, this) || url;
    this.url = target;
    this.webContents.loadURL(target);
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
    if (isAppPage(url)) {
      return;
    }
    const page = new URL(ERROR_URL);
    page.searchParams.set("url", url);
    page.searchParams.set("message", description || "");
    page.searchParams.set("code", String(code));
    this.webContents.loadURL(page.toString());
  }

  close() {
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

/// The browser window: its tabs, normal and private, which one is shown,
/// the profile in use, and what the tabs share.
class Browser {
  constructor(context) {
    Object.assign(this, context);
    this.profile = this.profiles.current();
    this.history = this.openHistory(this.profile);
    this.tabs = [];
    this.privateTabs = [];
    this.selected = null;
    this.fullScreen = false;
    this.chromeHeight = CHROME_HEIGHT;
    this.stateTimer = null;
    this.appliedSignature = "";
    this.makeWindow();
    this.restoreTabs();
    this.applyPrivacySettings();
    if (this.timezone) {
      this.timezone.onChange((zone) => this.applyTimezone(zone));
    }
  }

  /// Every tab's pages see `zone` (null: the system's) from now on.
  applyTimezone(zone) {
    for (const tab of this.allTabs) {
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

  // MARK: - Window

  makeWindow() {
    this.win = new BaseWindow({
      width: 1280,
      height: 860,
      minWidth: 640,
      minHeight: 420,
      title: "Noor",
      backgroundColor: "#f6f5f1",
      show: false,
      icon: path.join(__dirname, "..", "build", "icon.ico"),
    });
    this.win.setMenuBarVisibility(false);
    this.chrome = new WebContentsView({ webPreferences: this.webPreferences("persist:noor-chrome") });
    this.chrome.setBackgroundColor("#f6f5f1");
    this.win.contentView.addChildView(this.chrome);
    this.chrome.webContents.loadURL(CHROME_URL);
    this.chrome.webContents.once("did-finish-load", () => {
      this.win.show();
      this.pushState();
    });
    this.chrome.webContents.on("did-finish-load", () => this.pushState());
    this.chrome.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    for (const event of ["resize", "maximize", "unmaximize", "enter-full-screen", "leave-full-screen", "restore"]) {
      this.win.on(event, () => this.layout());
    }
    this.win.on("close", () => this.saveTabs());
    this.layout();
  }

  layout() {
    if (!this.win || this.win.isDestroyed()) {
      return;
    }
    const { width, height } = this.win.getContentBounds();
    const top = this.fullScreen ? 0 : this.chromeHeight;
    this.chrome.setBounds({ x: 0, y: 0, width, height: top });
    if (this.selected) {
      this.selected.view.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
    }
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

  toast(message) {
    this.chrome.webContents.send("noor:toast", message);
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
  }

  /// A window a page opens (window.open) becomes a tab that keeps its
  /// opener; a link to a new tab becomes a tab of our own.
  openWindow(opener, details) {
    const { url, disposition } = details;
    if (disposition === "new-window") {
      return {
        action: "allow",
        createWindow: (options) => {
          const webPreferences = Object.assign({}, options.webPreferences, this.webPreferences(this.partitionFor(opener.isPrivate)));
          const tab = new Tab(this, { isPrivate: opener.isPrivate, webPreferences, opener });
          this.insert(tab, opener);
          this.select(tab);
          this.pushState();
          return tab.webContents;
        },
      };
    }
    this.newTab({ isPrivate: opener.isPrivate, url, after: opener, select: disposition !== "background-tab" });
    return { action: "deny" };
  }

  select(tab) {
    if (!tab || tab === this.selected) {
      if (tab) {
        tab.loadIfNeeded();
      }
      return;
    }
    if (this.selected && !this.selected.webContents.isDestroyed()) {
      this.win.contentView.removeChildView(this.selected.view);
    }
    this.selected = tab;
    this.win.contentView.addChildView(tab.view);
    this.layout();
    tab.loadIfNeeded();
    tab.webContents.focus();
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
    const wasSelected = this.selected === tab;
    if (!tab.isPrivate && this.tabs.length === 0) {
      // There is always a normal tab.
      const blank = new Tab(this, { isPrivate: false, partition: this.partitionFor(false) });
      this.tabs.push(blank);
      blank.load(this.startURL(false));
    }
    if (wasSelected) {
      this.win.contentView.removeChildView(tab.view);
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
    if (this.selected) {
      this.win.contentView.removeChildView(this.selected.view);
      this.selected = null;
    }
    for (const tab of this.allTabs) {
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
      this.tabs.push(tab);
    }
    if (this.tabs.length === 0) {
      const blank = new Tab(this, { isPrivate: false, partition: this.partitionFor(false) });
      blank.deferredURL = this.startURL(false);
      blank.url = blank.deferredURL;
      this.tabs.push(blank);
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

  /// What the user typed in the address bar: opens it in `tab`.
  go(text, tab = this.selected) {
    const { resolve } = require("./address");
    const url = resolve(text, this.searchEngine);
    if (url && tab) {
      tab.load(url);
    }
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

  setNightMode(isOn) {
    this.store.set("nightMode", isOn);
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

  /// Gives every site new values for `kinds` and reloads the page with them.
  newFingerprint(kinds) {
    this.fingerprint.newSeeds(kinds);
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

  /// Shows another profile: closes every tab and opens the profile's
  /// remembered tabs, with its website data, history and fingerprints.
  switchProfile(id) {
    const profile = this.profiles.find(id);
    if (!profile || profile.id === this.profile.id) {
      return;
    }
    this.saveTabs();
    this.destroyTabs();
    this.profiles.select(id);
    this.profile = profile;
    this.shields.httpOnlyHosts.clear();
    this.history = this.openHistory(profile);
    this.restoreTabs();
    this.applyPrivacySettings({ reload: false });
    this.pushState();
  }

  createProfile(name) {
    const profile = this.profiles.add(name);
    this.switchProfile(profile.id);
    return profile;
  }

  /// Deletes a profile with everything it kept. Deleting the profile in
  /// use shows the default profile instead.
  async deleteProfile(id) {
    const profile = this.profiles.find(id);
    if (!profile || profile.isDefault) {
      return;
    }
    if (profile.id === this.profile.id) {
      this.switchProfile(DEFAULT_ID);
    }
    await this.clearData(profile);
    try {
      fs.rmSync(path.join(this.userData, this.profiles.historyFile(profile)), { force: true });
    } catch (error) {
      // The file stays; it holds only history.
    }
    this.profiles.remove(id);
    this.pushState();
  }

  async deleteAllProfiles() {
    for (const profile of this.profiles.all()) {
      if (!profile.isDefault) {
        await this.deleteProfile(profile.id);
      }
    }
  }

  /// Deletes a profile's cookies, cache and other website data.
  async clearData(profile) {
    for (const partition of [this.partitionFor(false, profile), this.partitionFor(true, profile)]) {
      const ses = session.fromPartition(partition);
      await ses.clearStorageData().catch(() => {});
      await ses.clearCache().catch(() => {});
      await ses.clearAuthCache().catch(() => {});
      ses.clearHostResolverCache().catch(() => {});
    }
  }

  // MARK: - New session

  /// Deletes the cookies, website data and history of the profile in use,
  /// closes every tab, gives every site new fingerprints in that profile
  /// and opens an empty tab. Other profiles and bookmarks are kept.
  async startNewSession() {
    this.destroyTabs();
    this.shields.httpOnlyHosts.clear();
    this.history.clear();
    this.fingerprint.newSeeds(KINDS);
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
      profile: { id: this.profile.id, name: this.profile.name },
      profiles: this.profiles.all(),
      stats: this.stats.toJSON(),
      nightMode: this.nightMode,
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

module.exports = { Browser, Tab, CHROME_HEIGHT, PRELOAD };
