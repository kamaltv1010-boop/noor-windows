"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { session, screen } = require("electron");
const { DEFAULT_ID } = require("./profiles");
const { ICON_SIZES, iconLook, icoFile, drawProfileIcons, profileAppId } = require("./profile-icon");

/// Bumped when the icons are drawn otherwise: the ones kept are made again.
const ICON_VERSION = 1;

/// Noor's windows: each shows one profile (see Browser in tabs.js), with
/// its own tabs, and a profile is open in one window at most. Opening a
/// profile opens its window, or brings it to the front. Each profile's
/// window has a button of its own in the taskbar, with an icon of its own
/// (its name on its color, see main/profile-icon.js); the first profile's
/// is Noor's. What goes on across windows is here too: the tabs nobody sees
/// (collecting cookies, see main/warmup.js), kept in a window that is
/// shown; profiles made, deleted, and, with "Replace a profile when
/// closed", deleted as their window closes and made again new.
class Windows {
  /// `makeBrowser(profile, bounds)`: a new window for `profile`; `appId`:
  /// the app's App User Model ID; `executable`: what starts the app (a
  /// pinned profile's button starts it with --profile=<id>); `appIcon`:
  /// the app's icon; `profileIdOfSession(ses)`: the profile a session is.
  constructor(context, { makeBrowser, appId = "ma.noor.browser", executable = process.execPath, appIcon = null, profileIdOfSession = null } = {}) {
    this.context = context;
    this.makeBrowser = makeBrowser;
    this.appId = appId;
    this.executable = executable;
    this.appIcon = appIcon;
    this.profileIdOfSession = profileIdOfSession;
    /// The windows open, as they were opened.
    this.list = [];
    /// The window in front, or the one used last.
    this.current = null;
    /// Set as the app quits: its windows close then, not one by one.
    this.quitting = false;
    /// Collecting cookies (see main/warmup.js), set once made.
    this.warmup = null;
    /// While the windows of the last run show (see restore): the one that
    /// stays in front, whichever of them the system gives the focus to.
    this.settling = null;
    /// The icon files made, by look: { ico, png }.
    this.icons = new Map();
  }

  get store() {
    return this.context.store;
  }

  get profiles() {
    return this.context.profiles;
  }

  get timezone() {
    return this.context.timezone;
  }

  get isIPhone() {
    return Boolean(this.context.fingerprint && this.context.fingerprint.iphoneMode);
  }

  get product() {
    return this.isIPhone ? "Noor iPhone" : "Noor";
  }

  /// The profile of the window in front (before any window opens, the one
  /// used last).
  get profile() {
    return this.current ? this.current.profile : this.profiles.current();
  }

  /// The windows not closing.
  get shown() {
    return this.list.filter((w) => !w.closing);
  }

  clearOnQuit() {
    return Boolean(this.store.get("clearOnQuit", false));
  }

  /// Whether a profile is deleted as its window closes, and a new one made
  /// in its place, the next of its series ("Profile 12" after "Profile 11").
  freshOnClose() {
    return Boolean(this.store.get("freshOnClose", false));
  }

  /// The partition of a profile's normal tabs or of its private ones (see
  /// Browser.partitionFor).
  partitionFor(isPrivate, profile = this.profile) {
    return isPrivate ? `noor-private-${profile.id}` : this.profiles.partition(profile, this.clearOnQuit());
  }

  get allTabs() {
    return this.list.flatMap((w) => w.allTabs);
  }

  get backgroundTabs() {
    return this.list.flatMap((w) => w.backgroundTabs);
  }

  // MARK: - Finding

  /// The window showing the profile `id`.
  forProfile(id) {
    return this.shown.find((w) => w.profile.id === id) || null;
  }

  /// The window a page is in: its toolbar's, one of its tabs', or a tab
  /// nobody sees there.
  browserFor(webContents) {
    if (!webContents) {
      return null;
    }
    const same = (wc) => Boolean(wc) && !wc.isDestroyed() && wc.id === webContents.id;
    return this.list.find((w) => (w.chrome && same(w.chrome.webContents)) || w.tabFor(webContents) || w.backgroundTabs.some((t) => same(t.webContents))) || null;
  }

  /// The tab a page is (not a tab nobody sees).
  tabFor(webContents) {
    for (const w of this.list) {
      const tab = w.tabFor(webContents);
      if (tab) {
        return tab;
      }
    }
    return null;
  }

  /// The profile a session is (its tabs say, see main.js), or null.
  profileOfSession(ses) {
    const id = this.profileIdOfSession ? this.profileIdOfSession(ses) : null;
    if (id) {
      return this.profiles.find(id);
    }
    return this.profiles.all().find((p) => {
      try {
        return session.fromPartition(this.partitionFor(false, p)) === ses;
      } catch (error) {
        return false;
      }
    }) || null;
  }

  // MARK: - Opening and closing

  /// Opens `profile` in a window of its own, or brings its window to the
  /// front.
  open(profile) {
    if (!this.restoring) {
      // Asked for now: this window is in front, not the last run's.
      this.settling = null;
    }
    const shown = this.forProfile(profile.id);
    if (shown) {
      shown.bringToFront();
      this.focused(shown);
      return shown;
    }
    const browser = this.makeBrowser(profile, this.nextBounds());
    this.list.push(browser);
    this.focused(browser);
    this.dress(browser);
    this.saveOpen();
    this.pushState();
    return browser;
  }

  /// Where a new window goes when it isn't as big as the screen (Noor's
  /// opens maximized, see Browser.makeWindow): a little right of and below
  /// the one in front, as big, and all of it on that screen.
  nextBounds() {
    const near = this.current && !this.current.closing && !this.current.win.isDestroyed() ? this.current.win.getNormalBounds() : null;
    if (!near) {
      return null;
    }
    let area = null;
    try {
      area = screen.getDisplayMatching(near).workArea;
    } catch (error) {
      area = null;
    }
    if (!area) {
      return { x: near.x + 32, y: near.y + 32, width: near.width, height: near.height };
    }
    const width = Math.min(near.width, Math.max(400, area.width - 48));
    const height = Math.min(near.height, Math.max(300, area.height - 48));
    let x = near.x + 32;
    let y = near.y + 32;
    if (x < area.x || y < area.y || x + width > area.x + area.width || y + height > area.y + area.height) {
      x = area.x + 24;
      y = area.y + 24;
    }
    return { x, y, width, height };
  }

  /// `browser` is the window in front: its profile is the one used last.
  focused(browser) {
    if (!browser || browser.closing) {
      return;
    }
    if (this.settling && browser !== this.settling && !this.settling.closing) {
      this.settling.bringToFront();
      return;
    }
    this.current = browser;
    if (this.profiles.find(browser.profile.id)) {
      this.profiles.select(browser.profile.id);
    }
  }

  /// Remembers the profiles open in windows, opened again at the next
  /// launch.
  saveOpen() {
    this.store.set("openWindows", this.shown.map((w) => w.profile.id));
  }

  /// The windows of the last run: the profiles open as it quit, or the
  /// one used last; with `wanted` (an id or a slot, see
  /// Profiles.findBySlot), that profile alone.
  restore(wanted = null) {
    const ids = wanted ? [wanted] : this.store.get("openWindows", []);
    const find = (id) => (wanted ? this.profiles.findBySlot(String(id)) : this.profiles.find(String(id)));
    const found = (Array.isArray(ids) ? ids : []).map(find).filter(Boolean);
    const opening = [...new Map(found.map((p) => [p.id, p])).values()];
    const last = this.profiles.current();
    if (!opening.length) {
      opening.push(last);
    }
    // The one used last, last: in front, and kept there while they all
    // show (a window shown may take the focus a moment later).
    opening.sort((a, b) => Number(a.id === last.id) - Number(b.id === last.id));
    this.restoring = true;
    try {
      for (const profile of opening) {
        this.open(profile);
      }
    } finally {
      this.restoring = false;
    }
    const front = this.current;
    if (front && this.list.length > 1) {
      this.settling = front;
      Promise.all(this.list.map((w) => w.shown)).then(() => {
        if (this.settling !== front) {
          return;
        }
        if (!front.closing) {
          front.bringToFront();
        }
        setTimeout(() => {
          if (this.settling === front) {
            this.settling = null;
          }
        }, 1000);
      });
    }
    return front;
  }

  /// A window closing: its tabs nobody sees go on in another window.
  closing(browser) {
    const other = this.shown.find((w) => w !== browser);
    if (!other) {
      return;
    }
    for (const tab of browser.backgroundTabs.slice()) {
      other.adopt(tab, browser);
    }
  }

  /// A window closed: forgotten, and, with "Replace a profile when
  /// closed", its profile deleted and a new one made in its place.
  closed(browser) {
    this.list = this.list.filter((w) => w !== browser);
    if (this.current === browser) {
      this.current = this.shown[this.shown.length - 1] || null;
      if (this.current) {
        this.focused(this.current);
      }
    }
    if (!this.quitting) {
      this.saveOpen();
    }
    const profile = browser.profile;
    if (!browser.deleting && this.freshOnClose() && !profile.isDefault && this.profiles.find(profile.id)) {
      this.replaceProfile(profile.id).catch(() => {});
    }
    this.pushState();
  }

  // MARK: - The taskbar

  /// A window's title, and its button in the taskbar: the first profile's
  /// is Noor's; another profile's has its own icon (its name on its
  /// color) and is a button of its own, grouped apart from the rest, which
  /// once pinned opens that profile. Settled once its icon is on.
  dress(browser) {
    const profile = browser.profile;
    const win = browser.win;
    if (!win || win.isDestroyed()) {
      return Promise.resolve();
    }
    win.setTitle(profile.isDefault ? this.product : `${profile.name} - ${this.product}`);
    if (profile.isDefault) {
      if (this.appIcon) {
        try {
          win.setIcon(this.appIcon);
        } catch (error) {
          // The icon it has stays.
        }
      }
      browser.taskbar = { appId: this.appId };
      browser.icon = null;
      this.setAppDetails(win, browser.taskbar);
      browser.dressing = Promise.resolve();
      return browser.dressing;
    }
    const look = iconLook(profile.name);
    const key = crypto.createHash("sha1").update(JSON.stringify([look, ICON_VERSION])).digest("hex").slice(0, 16);
    const kept = this.icons.get(key) || this.keptIcon(key);
    // Its own group from the start, with its icon once there is one.
    this.applyIcon(browser, profile, kept);
    if (kept) {
      browser.dressing = Promise.resolve();
      return browser.dressing;
    }
    browser.dressing = this.drawIcon(browser, look, key).then((made) => {
      if (made && browser.profile.id === profile.id && !win.isDestroyed()) {
        this.applyIcon(browser, profile, made);
      }
    }).catch(() => {});
    return browser.dressing;
  }

  iconFolder() {
    return path.join(this.context.userData, "ProfileIcons");
  }

  /// An icon made in an earlier run.
  keptIcon(key) {
    const files = { ico: path.join(this.iconFolder(), `${key}.ico`), png: path.join(this.iconFolder(), `${key}.png`) };
    if (fs.existsSync(files.ico) && fs.existsSync(files.png)) {
      this.icons.set(key, files);
      return files;
    }
    return null;
  }

  /// Draws a profile's icon in its window's toolbar page (which has a
  /// canvas) and keeps it as an .ico file and a PNG.
  async drawIcon(browser, look, key) {
    const wc = browser.chrome && browser.chrome.webContents;
    if (!wc || wc.isDestroyed()) {
      return null;
    }
    if (wc.isLoading()) {
      await new Promise((resolve) => wc.once("did-stop-loading", resolve));
    }
    const drawn = await wc.executeJavaScript(`(${drawProfileIcons.toString()})(${JSON.stringify(look)}, ${JSON.stringify(ICON_SIZES)})`, true);
    const images = ICON_SIZES.map((size) => {
      const url = drawn && drawn[size];
      const match = typeof url === "string" && /^data:image\/png;base64,(.+)$/.exec(url);
      return match ? { size, png: Buffer.from(match[1], "base64") } : null;
    }).filter(Boolean);
    if (!images.length) {
      return null;
    }
    const files = { ico: path.join(this.iconFolder(), `${key}.ico`), png: path.join(this.iconFolder(), `${key}.png`) };
    fs.mkdirSync(this.iconFolder(), { recursive: true });
    fs.writeFileSync(files.ico, icoFile(images));
    fs.writeFileSync(files.png, images[images.length - 1].png);
    this.icons.set(key, files);
    return files;
  }

  applyIcon(browser, profile, files) {
    const win = browser.win;
    if (!win || win.isDestroyed()) {
      return;
    }
    if (files) {
      try {
        win.setIcon(process.platform === "win32" ? files.ico : files.png);
      } catch (error) {
        // The icon it has stays.
      }
    }
    const details = { appId: profileAppId(this.appId, profile) };
    if (files) {
      Object.assign(details, { appIconPath: files.ico, appIconIndex: 0 });
    }
    if (this.executable) {
      Object.assign(details, { relaunchCommand: `"${this.executable}" --profile=${this.profiles.slotOf(profile)}`, relaunchDisplayName: `${profile.name} - ${this.product}` });
    }
    // What the window's button is, as told to Windows.
    browser.taskbar = details;
    browser.icon = files;
    this.setAppDetails(win, details);
  }

  setAppDetails(win, details) {
    if (process.platform !== "win32" || typeof win.setAppDetails !== "function") {
      return;
    }
    try {
      win.setAppDetails(details);
    } catch (error) {
      // The window keeps Noor's button.
    }
  }

  // MARK: - Profiles

  /// A new profile, in a window of its own.
  createProfile(name) {
    const profile = this.profiles.add(name);
    this.open(profile);
    this.collectInNew([profile]);
    return profile;
  }

  /// `count` new profiles at once, named after `name` (see
  /// Profiles.addMany); no window opens for them.
  createProfiles(count, name) {
    const made = this.profiles.addMany(count, name);
    this.collectInNew(made);
    this.pushState();
    return made;
  }

  /// New profiles collect their cookies, all at once, each in the
  /// background, where the settings say so (see main/warmup.js); with no
  /// window open (the app closing), at the next launch.
  collectInNew(profiles) {
    if (!this.warmup || !profiles.length || !this.warmup.settings().auto) {
      return;
    }
    if (this.quitting || !this.shown.length) {
      const pending = this.store.get("collectPending", []);
      const ids = (Array.isArray(pending) ? pending : []).concat(profiles.map((p) => p.id));
      this.store.set("collectPending", [...new Set(ids)]);
      return;
    }
    this.warmup.startMany(profiles).catch(() => {});
  }

  /// The collections left for this launch (see collectInNew).
  collectPending() {
    const pending = this.store.get("collectPending", []);
    this.store.set("collectPending", []);
    const profiles = (Array.isArray(pending) ? pending : []).map((id) => this.profiles.find(String(id))).filter(Boolean);
    if (profiles.length && this.warmup && this.warmup.settings().auto) {
      this.warmup.startMany(profiles).catch(() => {});
    }
  }

  /// Deletes a profile with everything it kept; its window closes (the
  /// last one shows the first profile instead).
  async deleteProfile(id) {
    const profile = this.profiles.find(id);
    if (!profile || profile.isDefault) {
      return;
    }
    if (this.warmup) {
      this.warmup.stop(profile.id);
    }
    const shown = this.forProfile(profile.id);
    if (shown) {
      if (this.shown.length > 1) {
        shown.deleting = true;
        shown.win.close();
      } else {
        shown.switchProfile(DEFAULT_ID);
      }
    }
    await this.clearData(profile);
    this.removeHistory(profile);
    this.profiles.remove(id);
    if (!this.quitting) {
      this.saveOpen();
    }
    this.pushState();
  }

  async deleteAllProfiles() {
    for (const profile of this.profiles.all()) {
      if (!profile.isDefault) {
        await this.deleteProfile(profile.id);
      }
    }
  }

  /// Deletes the profile `id` with everything it kept, and makes a new one
  /// in its place (see freshOnClose), the next of its series ("Profile 12"
  /// when the highest is "Profile 11", see Profiles.nextInSeries): its new
  /// fingerprints, no cookies, and its cookies collected if new profiles
  /// collect theirs. The new one.
  async replaceProfile(id) {
    const old = this.profiles.find(id);
    if (!old || old.isDefault || this.forProfile(id)) {
      return null;
    }
    if (this.warmup) {
      this.warmup.stop(old.id);
    }
    const fresh = this.profiles.replace(old.id);
    if (!fresh) {
      return null;
    }
    // Its place among the windows of the next launch is the new one's.
    const open = this.store.get("openWindows", []);
    if (Array.isArray(open) && open.includes(old.id)) {
      this.store.set("openWindows", open.map((x) => (x === old.id ? fresh.id : x)));
    }
    this.removeHistory(old);
    this.collectInNew([fresh]);
    this.pushState();
    await this.clearData(old);
    return fresh;
  }

  removeHistory(profile) {
    try {
      fs.rmSync(path.join(this.context.userData, this.profiles.historyFile(profile)), { force: true });
    } catch (error) {
      // The file stays; it holds only history.
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

  // MARK: - Tabs nobody sees

  /// A tab nobody sees for `profile` (see Browser.backgroundTab), in the
  /// window in front: shown, so its pages run as a shown page's do.
  backgroundTab(profile) {
    const host = (this.current && !this.current.closing ? this.current : null) || this.shown[0];
    if (!host) {
      throw new Error("No window");
    }
    return host.backgroundTab(profile);
  }

  closeBackgroundTab(tab) {
    const host = this.list.find((w) => w.backgroundTabs.includes(tab));
    if (host) {
      host.closeBackgroundTab(tab);
    } else {
      tab.close();
    }
  }

  // MARK: - Every window

  toast(message) {
    const target = this.current && !this.current.closing ? this.current : this.shown[0];
    if (target) {
      target.toast(message);
    }
  }

  pushState() {
    for (const w of this.shown) {
      w.pushState();
    }
  }

  applyPrivacySettings() {
    for (const w of this.shown) {
      w.applyPrivacySettings();
    }
  }

  setNightMode(isOn) {
    this.store.set("nightMode", Boolean(isOn));
    for (const w of this.shown) {
      w.setNightMode(Boolean(isOn));
    }
  }

  trackerBlocked(webContents) {
    const tab = this.tabFor(webContents);
    if (tab) {
      tab.trackersBlocked += 1;
      tab.browser.pushState();
    }
    this.context.stats.trackerBlocked();
  }
}

/// The profile a command line asks for (--profile=<id>), or null.
const profileArgument = (argv) => {
  for (const arg of argv || []) {
    const match = /^--profile=(.+)$/.exec(String(arg));
    if (match) {
      return match[1];
    }
  }
  return null;
};

module.exports = { Windows, profileArgument };
