"use strict";
const { app, Menu, dialog, clipboard, shell } = require("electron");
const { Shields } = require("./shields");
const { SETTINGS_URL, LIBRARY_URL, COOKIES_URL, isWebPage } = require("./address");
const { STORE_URL } = require("./crx");
const { iconLook } = require("./profile-icon");
const mobile = require("./mobile");

const KIND_TITLES = {
  canvas: "Canvas", webGL: "WebGL", audio: "Audio", clientRects: "ClientRects", screen: "Screen Size", hardware: "Processor & Memory",
  fonts: "Fonts", device: "iPhone", gpu: "WebGL Vendor & Renderer",
};

/// The menus: the ⋯ menu, the profile menu, the shields menu, a tab's
/// and a page's context menus, and the application menu that holds the
/// keyboard shortcuts.
class Menus {
  constructor(browser) {
    this.browser = browser;
  }

  popup(template) {
    Menu.buildFromTemplate(template).popup({ window: this.browser.win });
  }

  /// The ⋯ menu, as Chrome's: what opens, the profile, the tools, the
  /// zoom, the settings; a small icon by each (see Browser.showMenu).
  more(anchor = null) {
    this.browser.showMenu(() => this.moreItems(), anchor, "end");
  }

  moreItems() {
    const browser = this.browser;
    const tab = browser.selected;
    const zoom = tab && !tab.webContents.isDestroyed() ? Math.round(tab.webContents.getZoomFactor() * 100) : 100;
    const warmup = browser.windows && browser.windows.warmup;
    const status = warmup ? warmup.status(browser.profile.id) : null;
    const product = browser.product;
    return [
      { icon: "newTab", label: "New tab", shortcut: "Ctrl+T", click: () => browser.newTab() },
      { icon: "private", label: "New private tab", shortcut: "Ctrl+Shift+N", click: () => browser.newTab({ isPrivate: true }) },
      { type: "separator" },
      {
        type: "profile",
        profile: profileLook(browser.profile),
        label: browser.profile.name,
        pill: status && (status.running || status.waiting) ? "Collecting cookies" : "",
        submenu: this.profileItems(),
      },
      { icon: "history", label: "Bookmarks and history", shortcut: "Ctrl+H", click: () => browser.newTab({ url: LIBRARY_URL }) },
      // Pinned links: a row above the favorites, opened as an address typed.
      {
        icon: "pin",
        label: tab && isWebPage(tab.url) && browser.pins && browser.pins.contains(browser.pinURL(tab.url)) ? "Unpin this page" : "Pin this page",
        enabled: Boolean(tab && isWebPage(tab.url)),
        click: () => browser.togglePin(),
      },
      { icon: "cookie", label: "Cookies", submenu: this.cookieItems() },
      { icon: "fingerprint", label: "Fingerprint", submenu: this.fingerprintItems() },
      {
        icon: "puzzle",
        label: "Extensions",
        submenu: [
          { icon: "puzzle", label: "Manage extensions", click: () => browser.newTab({ url: SETTINGS_URL + "#extensions" }) },
          { icon: "store", label: "Visit the Chrome Web Store", click: () => browser.newTab({ url: STORE_URL }) },
        ],
      },
      { icon: "flame", label: "New session…", click: () => this.confirmNewSession() },
      { type: "separator" },
      {
        type: "zoom",
        label: "Zoom",
        value: `${zoom}%`,
        enabled: Boolean(tab),
        actions: {
          minus: () => this.zoomBy(1 / 1.1),
          plus: () => this.zoomBy(1.1),
          full: { click: () => browser.setFullScreen(!browser.fullScreen), keepOpen: false },
        },
      },
      {
        type: "toggle",
        icon: "moon",
        label: "Night mode",
        checked: browser.nightMode,
        keepOpen: true,
        click: () => (browser.windows ? browser.windows.setNightMode(!browser.nightMode) : browser.setNightMode(!browser.nightMode)),
      },
      { icon: "search", label: "Find on page", shortcut: "Ctrl+F", click: () => browser.findOnPage() },
      { icon: "printer", label: "Print…", shortcut: "Ctrl+P", enabled: Boolean(tab && isWebPage(tab.url)), click: () => browser.print() },
      { type: "separator" },
      { icon: "settings", label: "Settings", shortcut: "Ctrl+,", click: () => browser.newTab({ url: SETTINGS_URL }) },
      { icon: "info", label: `About ${product}`, detail: app.getVersion(), click: () => browser.newTab({ url: SETTINGS_URL + "#about" }) },
      { icon: "exit", label: "Exit", click: () => app.quit() },
    ];
  }

  /// Zoom as a list (the application menu's shortcuts zoom by steps).
  zoomItems() {
    const tab = this.browser.selected;
    return [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2].map((zoom) => ({
      label: `${Math.round(zoom * 100)}%`,
      type: "radio",
      checked: Boolean(tab) && Math.abs(tab.webContents.getZoomFactor() - zoom) < 0.01,
      click: () => tab && tab.webContents.setZoomFactor(zoom),
    }));
  }

  /// New values for one kind of fingerprint, or for all.
  fingerprintItems() {
    const browser = this.browser;
    // (Noor Android's WebGL Vendor & Renderer comes with the device:
    // nothing to make new.)
    const items = browser.fingerprint.kinds.filter((kind) => !browser.fingerprint.switchOnly.has(kind)).map((kind) => (kind === "device" ? {
      icon: "refresh",
      label: `New ${mobile.kindName(browser.fingerprint.family())}`,
      click: () => {
        browser.newFingerprint([kind]);
        browser.toast(`Now: ${browser.fingerprint.iphone().name}`);
      },
    } : {
      icon: "refresh",
      label: `New ${KIND_TITLES[kind]} fingerprint`,
      enabled: browser.fingerprint.isEnabled(kind),
      click: () => {
        browser.newFingerprint([kind]);
        browser.toast(`${KIND_TITLES[kind]} fingerprint changed`);
      },
    }));
    items.push({ type: "separator" });
    items.push({
      icon: "fingerprint",
      label: "Change all",
      click: () => {
        browser.newFingerprint(browser.fingerprint.kinds);
        browser.toast("All fingerprints changed");
      },
    });
    items.push({ icon: "settings", label: "Fingerprint settings", click: () => browser.newTab({ url: SETTINGS_URL + "#fingerprint" }) });
    return items;
  }

  /// Collecting cookies, and seeing them.
  cookieItems() {
    const browser = this.browser;
    const tab = browser.selected;
    const onPage = Boolean(tab && isWebPage(tab.url));
    return [
      // The shown page's cookies as its Cookie header: copied, or pasted in.
      { icon: "copy", label: "Copy cookies of this page", shortcut: "Ctrl+O", enabled: onPage, click: () => browser.copyCookies() },
      { icon: "paste", label: "Paste cookies into this page…", enabled: onPage, click: () => browser.pasteCookies() },
      { type: "separator" },
      { icon: "cookie", label: "Collect cookies…", click: () => browser.newTab({ url: SETTINGS_URL + "#cookies" }) },
      { icon: "list", label: "See cookies", click: () => browser.newTab({ url: COOKIES_URL }) },
    ];
  }

  /// The profiles, each with its initial on its color: each opens in a
  /// window of its own (or its window comes to the front); this window's
  /// is checked. Then making profiles, their cookies, deleting them.
  profileItems() {
    const browser = this.browser;
    const windows = browser.windows;
    const items = browser.profiles.all().map((profile) => {
      const here = profile.id === browser.profile.id;
      const elsewhere = !here && Boolean(windows && windows.forProfile(profile.id));
      return {
        type: "profileItem",
        profile: profileLook(profile),
        label: profile.name,
        checked: here,
        note: elsewhere ? "Open" : "",
        click: () => {
          if (!here && windows) {
            windows.open(profile);
          }
        },
      };
    });
    items.push({ type: "separator" });
    items.push({ icon: "userPlus", label: "New profile…", click: () => this.newProfile() });
    items.push({ icon: "users", label: "Create multiple profiles…", click: () => this.newProfiles() });
    items.push({ type: "separator" });
    items.push(...this.cookieItems());
    if (browser.profiles.all().length > 1) {
      items.push({ type: "separator" });
      items.push({ icon: "trash", label: "Delete all profiles…", danger: true, click: () => this.confirmDeleteAllProfiles() });
    }
    return items;
  }

  /// The profile button's menu: this window's profile, then every profile
  /// and what to do with them.
  profile(anchor = null, align = "end") {
    const browser = this.browser;
    this.browser.showMenu(() => [
      { type: "header", profile: profileLook(browser.profile), title: browser.profile.name, subtitle: "This window's profile. Each profile opens in a window of its own." },
      { type: "separator" },
      ...this.profileItems(),
    ], anchor, align);
  }

  /// How many profiles to make at once, asked in the toolbar.
  newProfiles() {
    this.browser.prompt({ title: "How many profiles?", placeholder: "10", value: "10", action: "profiles:createMany", button: "Create" });
  }

  newProfile() {
    const number = this.browser.profiles.all().length + 1;
    this.browser.prompt({ title: "New Profile", placeholder: "Name", value: `Profile ${number}`, action: "profiles:create" });
  }

  async confirmDeleteAllProfiles() {
    const browser = this.browser;
    const kept = browser.profiles.all().find((p) => p.isDefault);
    const { response } = await dialog.showMessageBox(browser.win, {
      type: "warning",
      buttons: ["Cancel", "Delete All Profiles"],
      defaultId: 0,
      cancelId: 0,
      message: "Delete all profiles?",
      detail: `This deletes every profile except “${kept.name}”, with its cookies, website data, history and tabs. Bookmarks are kept.`,
    });
    if (response === 1) {
      await browser.deleteAllProfiles();
      browser.toast("Profiles deleted");
    }
  }

  async confirmDeleteProfile(id) {
    const browser = this.browser;
    const profile = browser.profiles.find(id);
    if (!profile || profile.isDefault) {
      return;
    }
    const { response } = await dialog.showMessageBox(browser.win, {
      type: "warning",
      buttons: ["Cancel", "Delete Profile"],
      defaultId: 0,
      cancelId: 0,
      message: `Delete “${profile.name}”?`,
      detail: "This deletes the profile’s cookies, website data, history and tabs. Bookmarks are kept.",
    });
    if (response === 1) {
      await browser.deleteProfile(id);
      browser.toast(`“${profile.name}” deleted`);
    }
  }

  async confirmNewSession() {
    const browser = this.browser;
    const { response } = await dialog.showMessageBox(browser.win, {
      type: "warning",
      buttons: ["Cancel", "New Session"],
      defaultId: 1,
      cancelId: 0,
      message: "Start a new session?",
      detail: `This deletes the cookies, website data and history of “${browser.profile.name}” (this window's profile), closes its tabs and changes all its fingerprints. Other profiles and bookmarks are kept.`,
    });
    if (response === 1) {
      await browser.startNewSession();
    }
  }

  /// The shields' menu, for the shown page's site: up or down, what they
  /// blocked, and its fingerprints.
  shields(anchor = null) {
    this.browser.showMenu(() => this.shieldItems(), anchor, "start");
  }

  shieldItems() {
    const browser = this.browser;
    const tab = browser.selected;
    const site = tab ? Shields.site(tab.url) : null;
    if (!site || !isWebPage(tab.url)) {
      return [
        { type: "header", icon: "shield", title: "Shields protect websites", subtitle: "Open a site to see what they block there." },
        { type: "separator" },
        { icon: "settings", label: "Shields settings", click: () => browser.newTab({ url: SETTINGS_URL + "#shields" }) },
      ];
    }
    const up = browser.shields.areUp(tab.url);
    return [
      {
        type: "header",
        icon: up ? "shieldCheck" : "shieldOff",
        title: up ? `Shields are up for ${site}` : `Shields are down for ${site}`,
        subtitle: up ? `${tab.trackersBlocked} trackers blocked on this page` : "Trackers can load, and the site sees this PC as it is.",
      },
      { type: "separator" },
      {
        type: "toggle",
        icon: "shield",
        label: `Shields for ${site}`,
        checked: up,
        keepOpen: true,
        click: () => {
          browser.setShieldsUp(!up);
          if (browser.windows) {
            browser.windows.applyPrivacySettings();
          }
        },
      },
      { icon: "fingerprint", label: "Fingerprint", submenu: this.fingerprintItems() },
      { type: "separator" },
      { icon: "settings", label: "Shields settings", click: () => browser.newTab({ url: SETTINGS_URL + "#shields" }) },
    ];
  }

  tab(tab) {
    const browser = this.browser;
    this.popup([
      { label: "New Tab", click: () => browser.newTab({ isPrivate: tab.isPrivate, after: tab }) },
      { label: "Reload", click: () => tab.reload() },
      { label: "Duplicate", click: () => browser.newTab({ isPrivate: tab.isPrivate, url: tab.deferredURL || tab.url, after: tab }) },
      { type: "separator" },
      { label: "Close Tab", click: () => browser.close(tab) },
      { label: "Close Other Tabs", click: () => browser.closeOthers(tab) },
    ]);
  }

  page(tab, params) {
    const browser = this.browser;
    const items = [];
    if (browser.extensions) {
      const own = browser.extensions.contextMenuItems(tab, params);
      if (own.length) {
        items.push(...own, { type: "separator" });
      }
    }
    if (params.linkURL) {
      items.push(
        { label: "Open Link in New Tab", click: () => browser.newTab({ isPrivate: tab.isPrivate, url: params.linkURL, after: tab, select: false }) },
        { label: "Open Link in Private Tab", click: () => browser.newTab({ isPrivate: true, url: params.linkURL }) },
        { label: "Pin Link", enabled: isWebPage(params.linkURL), click: () => browser.pinLink(params.linkURL) },
        { label: "Copy Link", click: () => clipboard.writeText(params.linkURL) },
        { type: "separator" },
      );
    }
    if (params.mediaType === "image" && params.srcURL) {
      items.push(
        { label: "Open Image in New Tab", click: () => browser.newTab({ isPrivate: tab.isPrivate, url: params.srcURL, after: tab, select: false }) },
        { label: "Copy Image", click: () => tab.webContents.copyImageAt(params.x, params.y) },
        { label: "Save Image…", click: () => tab.webContents.downloadURL(params.srcURL) },
        { type: "separator" },
      );
    }
    if (params.isEditable) {
      items.push(
        { label: "Undo", role: "undo" }, { label: "Redo", role: "redo" }, { type: "separator" },
        { label: "Cut", role: "cut" }, { label: "Copy", role: "copy" }, { label: "Paste", role: "paste" },
        { label: "Select All", role: "selectAll" }, { type: "separator" },
      );
    } else if (params.selectionText) {
      const text = params.selectionText.trim();
      items.push(
        { label: "Copy", role: "copy" },
        { label: `Search for “${text.length > 40 ? text.slice(0, 40) + "…" : text}”`, click: () => browser.newTab({ isPrivate: tab.isPrivate, url: require("./address").search(text, browser.searchEngine), after: tab }) },
        { type: "separator" },
      );
    }
    items.push(
      { label: "Back", enabled: tab.canGoBack(), click: () => tab.goBack() },
      { label: "Forward", enabled: tab.canGoForward(), click: () => tab.goForward() },
      { label: "Reload", click: () => tab.reload() },
      { type: "separator" },
      { label: "Copy Page Address", enabled: isWebPage(tab.url), click: () => clipboard.writeText(tab.url) },
      { label: "Inspect", click: () => tab.webContents.inspectElement(params.x, params.y) },
    );
    Menu.buildFromTemplate(items).popup({ window: browser.win });
  }

  /// The application menu: hidden, but its shortcuts work, in the window
  /// in front.
  application() {
    const front = () => (this.browser.windows && this.browser.windows.current) || this.browser;
    // What each shortcut acts on: the window in front at the time.
    const browser = new Proxy({}, { get: (target, key) => {
      const current = front();
      const value = current[key];
      return typeof value === "function" ? value.bind(current) : value;
    } });
    const tab = () => front().selected;
    return Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          { label: "New Tab", accelerator: "CmdOrCtrl+T", click: () => browser.newTab() },
          { label: "New Private Tab", accelerator: "CmdOrCtrl+Shift+N", click: () => browser.newTab({ isPrivate: true }) },
          { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: () => tab() && browser.close(tab()) },
          { label: "Print…", accelerator: "CmdOrCtrl+P", click: () => browser.print() },
          { type: "separator" },
          { label: "Quit", accelerator: "CmdOrCtrl+Q", role: "quit" },
        ],
      },
      {
        label: "View",
        submenu: [
          { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => tab() && tab().reload() },
          { label: "Reload", accelerator: "F5", visible: false, click: () => tab() && tab().reload() },
          { label: "Zoom In", accelerator: "CmdOrCtrl+=", click: () => this.zoomBy(1.1, front()) },
          { label: "Zoom In", accelerator: "CmdOrCtrl+numadd", visible: false, click: () => this.zoomBy(1.1, front()) },
          { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: () => this.zoomBy(1 / 1.1, front()) },
          { label: "Zoom Out", accelerator: "CmdOrCtrl+numsub", visible: false, click: () => this.zoomBy(1 / 1.1, front()) },
          { label: "Actual Size", accelerator: "CmdOrCtrl+0", click: () => tab() && tab().webContents.setZoomFactor(1) },
          { label: "Find on Page", accelerator: "CmdOrCtrl+F", click: () => browser.findOnPage() },
          { label: "Full Screen", accelerator: "F11", click: () => browser.setFullScreen(!browser.fullScreen) },
          { label: "Developer Tools", accelerator: "CmdOrCtrl+Shift+I", click: () => tab() && tab().webContents.toggleDevTools() },
          { label: "Developer Tools", accelerator: "F12", visible: false, click: () => tab() && tab().webContents.toggleDevTools() },
        ],
      },
      {
        label: "Go",
        submenu: [
          { label: "Address Bar", accelerator: "CmdOrCtrl+L", click: () => browser.focusAddressBar() },
          { label: "Address Bar", accelerator: "Alt+D", visible: false, click: () => browser.focusAddressBar() },
          { label: "Back", accelerator: "Alt+Left", click: () => tab() && tab().goBack() },
          { label: "Forward", accelerator: "Alt+Right", click: () => tab() && tab().goForward() },
          { label: "Next Tab", accelerator: "CmdOrCtrl+Tab", click: () => browser.selectNext(1) },
          { label: "Previous Tab", accelerator: "CmdOrCtrl+Shift+Tab", click: () => browser.selectNext(-1) },
          { type: "separator" },
          { label: "Add Bookmark", accelerator: "CmdOrCtrl+D", click: () => browser.toggleBookmark() },
          { label: "Copy Cookies of This Page", accelerator: "CmdOrCtrl+O", click: () => browser.copyCookies() },
          { label: "Bookmarks & History", accelerator: "CmdOrCtrl+H", click: () => browser.newTab({ url: LIBRARY_URL }) },
          { label: "Settings", accelerator: "CmdOrCtrl+,", click: () => browser.newTab({ url: SETTINGS_URL }) },
          { label: "Noor on GitHub", click: () => shell.openExternal("https://github.com/kamaltv1010-boop/noor-windows") },
        ],
      },
    ]);
  }

  zoomBy(factor, browser = this.browser) {
    const tab = browser.selected;
    if (tab) {
      tab.webContents.setZoomFactor(Math.min(3, Math.max(0.25, tab.webContents.getZoomFactor() * factor)));
    }
  }
}

/// A profile as the menus show it: its initial (or its number) on its
/// color, the color of its window's icon in the taskbar.
const profileLook = (profile) => {
  const name = String((profile && profile.name) || "");
  const number = /(\d+)\s*$/.exec(name);
  const initial = number ? number[1].slice(-3) : (name.trim()[0] || "?").toUpperCase();
  return { color: profile && profile.isDefault ? "#5b3df5" : iconLook(name).colors[0], initial };
};

module.exports = { Menus, KIND_TITLES, profileLook };
