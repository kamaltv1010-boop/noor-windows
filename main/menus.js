"use strict";
const { Menu, dialog, clipboard, shell } = require("electron");
const { KINDS } = require("./fingerprint");
const { Shields } = require("./shields");
const { SETTINGS_URL, LIBRARY_URL, isWebPage } = require("./address");

const KIND_TITLES = {
  canvas: "Canvas", webGL: "WebGL", audio: "Audio", clientRects: "ClientRects", screen: "Screen Size", hardware: "Processor & Memory",
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

  more() {
    const browser = this.browser;
    this.popup([
      { label: "New Tab", accelerator: "CmdOrCtrl+T", click: () => browser.newTab() },
      { label: "New Private Tab", accelerator: "CmdOrCtrl+Shift+N", click: () => browser.newTab({ isPrivate: true }) },
      { label: "Bookmarks & History", accelerator: "CmdOrCtrl+H", click: () => browser.newTab({ url: LIBRARY_URL }) },
      { type: "separator" },
      { label: "Zoom", submenu: this.zoomItems() },
      { label: "Night Mode", type: "checkbox", checked: browser.nightMode, click: (item) => browser.setNightMode(item.checked) },
      { label: "Find on Page", accelerator: "CmdOrCtrl+F", click: () => browser.findOnPage() },
      { type: "separator" },
      { label: `Profile: ${browser.profile.name}`, submenu: this.profileItems() },
      { label: "Fingerprint", submenu: this.fingerprintItems() },
      { type: "separator" },
      { label: "Settings", accelerator: "CmdOrCtrl+,", click: () => browser.newTab({ url: SETTINGS_URL }) },
      { label: "New Session…", click: () => this.confirmNewSession() },
    ]);
  }

  zoomItems() {
    const tab = this.browser.selected;
    return [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2].map((zoom) => ({
      label: `${Math.round(zoom * 100)}%`,
      type: "radio",
      checked: Boolean(tab) && Math.abs(tab.webContents.getZoomFactor() - zoom) < 0.01,
      click: () => tab && tab.webContents.setZoomFactor(zoom),
    }));
  }

  fingerprintItems() {
    const browser = this.browser;
    const items = KINDS.map((kind) => ({
      label: `New ${KIND_TITLES[kind]} Fingerprint`,
      enabled: browser.fingerprint.isEnabled(kind),
      click: () => {
        browser.newFingerprint([kind]);
        browser.toast(`${KIND_TITLES[kind]} fingerprint changed`);
      },
    }));
    items.push({ type: "separator" });
    items.push({
      label: "Change All",
      click: () => {
        browser.newFingerprint(KINDS);
        browser.toast("All fingerprints changed");
      },
    });
    return items;
  }

  profileItems() {
    const browser = this.browser;
    const items = browser.profiles.all().map((profile) => ({
      label: profile.name,
      type: "radio",
      checked: profile.id === browser.profile.id,
      click: () => {
        if (profile.id !== browser.profile.id) {
          browser.switchProfile(profile.id);
          browser.toast(`Switched to “${profile.name}”`);
        }
      },
    }));
    items.push({ type: "separator" });
    items.push({ label: "New Profile…", click: () => this.newProfile() });
    if (browser.profiles.all().length > 1) {
      items.push({ label: "Delete All Profiles…", click: () => this.confirmDeleteAllProfiles() });
    }
    return items;
  }

  profile() {
    this.popup(this.profileItems());
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
      detail: "This deletes the cookies, website data and history of the profile in use, closes its tabs and changes all its fingerprints. Other profiles and bookmarks are kept.",
    });
    if (response === 1) {
      await browser.startNewSession();
    }
  }

  shields() {
    const browser = this.browser;
    const tab = browser.selected;
    const site = tab ? Shields.site(tab.url) : null;
    if (!site || !isWebPage(tab.url)) {
      this.popup([{ label: "Shields protect websites", enabled: false }]);
      return;
    }
    const up = browser.shields.areUp(tab.url);
    this.popup([
      { label: `Shields ${up ? "up" : "down"} for ${site}`, enabled: false },
      { label: `${tab.trackersBlocked} trackers blocked on this page`, enabled: false },
      { type: "separator" },
      { label: `Shields for ${site}`, type: "checkbox", checked: up, click: (item) => browser.setShieldsUp(item.checked) },
      { type: "separator" },
      { label: "Fingerprint", submenu: this.fingerprintItems() },
    ]);
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
    if (params.linkURL) {
      items.push(
        { label: "Open Link in New Tab", click: () => browser.newTab({ isPrivate: tab.isPrivate, url: params.linkURL, after: tab, select: false }) },
        { label: "Open Link in Private Tab", click: () => browser.newTab({ isPrivate: true, url: params.linkURL }) },
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

  /// The application menu: hidden, but its shortcuts work.
  application() {
    const browser = this.browser;
    const tab = () => browser.selected;
    return Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          { label: "New Tab", accelerator: "CmdOrCtrl+T", click: () => browser.newTab() },
          { label: "New Private Tab", accelerator: "CmdOrCtrl+Shift+N", click: () => browser.newTab({ isPrivate: true }) },
          { label: "Close Tab", accelerator: "CmdOrCtrl+W", click: () => tab() && browser.close(tab()) },
          { type: "separator" },
          { label: "Quit", accelerator: "CmdOrCtrl+Q", role: "quit" },
        ],
      },
      {
        label: "View",
        submenu: [
          { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => tab() && tab().reload() },
          { label: "Reload", accelerator: "F5", visible: false, click: () => tab() && tab().reload() },
          { label: "Zoom In", accelerator: "CmdOrCtrl+=", click: () => this.zoomBy(1.1) },
          { label: "Zoom In", accelerator: "CmdOrCtrl+numadd", visible: false, click: () => this.zoomBy(1.1) },
          { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: () => this.zoomBy(1 / 1.1) },
          { label: "Zoom Out", accelerator: "CmdOrCtrl+numsub", visible: false, click: () => this.zoomBy(1 / 1.1) },
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
          { label: "Bookmarks & History", accelerator: "CmdOrCtrl+H", click: () => browser.newTab({ url: LIBRARY_URL }) },
          { label: "Settings", accelerator: "CmdOrCtrl+,", click: () => browser.newTab({ url: SETTINGS_URL }) },
          { label: "Noor on GitHub", click: () => shell.openExternal("https://github.com/kamaltv1010-boop/noor-windows") },
        ],
      },
    ]);
  }

  zoomBy(factor) {
    const tab = this.browser.selected;
    if (tab) {
      tab.webContents.setZoomFactor(Math.min(3, Math.max(0.25, tab.webContents.getZoomFactor() * factor)));
    }
  }
}

module.exports = { Menus, KIND_TITLES };
