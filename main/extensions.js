"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { app, dialog, nativeImage, net } = require("electron");
const AdmZip = require("adm-zip");
const { ElectronChromeExtensions } = require("electron-chrome-extensions");
const {
  STORE_URL, downloadURL, updateCheckURL, parseUpdateResponse, compareVersions, parseCrx,
  localized, localeFolders, permissionSummary,
} = require("./crx");

/// The preload that gives an extension's service worker Chrome's
/// extension APIs: electron-chrome-extensions' own, run only in an
/// extension's worker (the library runs it in every service worker, and
/// a site's own worker would see an "electron" object no Chrome has).
const SERVICE_WORKER_PRELOAD = path.join(__dirname, "..", "scripts", "extension-sw-preload.js");
/// How often the store's extensions are checked for new versions.
const UPDATE_EVERY = 5 * 60 * 60 * 1000;
/// The biggest extension downloaded (Chrome's own limit is about this).
const MAX_DOWNLOAD = 256 * 1024 * 1024;

/// Chrome web extensions, run by Chromium itself in every profile's normal
/// tabs, as the iPhone app runs them: added from the Chrome Web Store (a
/// store page gets an "Add to Noor" button in the toolbar), or from a .crx
/// or .zip file or a folder with a manifest.json; kept in the app's data
/// folder, the store's ones updated as Chrome updates them, and listed in
/// the settings, where each can be turned off or removed. Their buttons
/// are in the toolbar, their menu items in the page's menu. Chromium can't
/// run extensions where nothing is kept on disk, so private tabs (and every
/// tab while "Clear everything on quit" is on) go without them, as Chrome's
/// Incognito windows do unless told otherwise.
class Extensions {
  constructor({ store, userData }) {
    this.store = store;
    /// The store's extensions, as Chrome keeps them: <id>/<version>_0.
    this.storeDir = path.join(userData, "Extensions");
    /// The ones added from a file or folder.
    this.localDir = path.join(userData, "LocalExtensions");
    /// The extension APIs of each profile's session.
    this.managers = new Map();
    /// Store IDs being added now.
    this.installing = new Set();
    this.browser = null;
    this.updater = null;
  }

  // MARK: - What is installed

  /// The installed extensions as kept: id, folder, from where, whether on.
  installed() {
    const saved = this.store.get("extensions", []);
    if (!Array.isArray(saved)) {
      return [];
    }
    return saved
      .filter((e) => e && typeof e.id === "string" && typeof e.path === "string")
      .map((e) => ({ id: e.id, path: e.path, source: e.source === "store" ? "store" : "file", enabled: e.enabled !== false }));
  }

  save(list) {
    this.store.set("extensions", list.map((e) => ({ id: e.id, path: e.path, source: e.source, enabled: e.enabled })));
  }

  record(entry) {
    const list = this.installed();
    const index = list.findIndex((e) => e.id === entry.id);
    if (index === -1) {
      list.push(entry);
    } else {
      list[index] = entry;
    }
    this.save(list);
  }

  isInstalled(id) {
    return this.installed().some((e) => e.id === id);
  }

  isInstalling(id) {
    return this.installing.has(id);
  }

  sessions() {
    return [...this.managers.keys()];
  }

  // MARK: - Sessions

  /// A profile's session gets the extension APIs and the extensions that
  /// are on. Only one kept on disk can run them.
  attach(ses) {
    if (this.managers.has(ses) || !ses.isPersistent()) {
      return;
    }
    const manager = new ElectronChromeExtensions({
      session: ses,
      createTab: async (details) => {
        const browser = this.browser;
        if (!browser) {
          throw new Error("No window");
        }
        const tab = browser.newTab({ url: details.url || null, select: details.active !== false });
        return [tab.webContents, browser.win];
      },
      selectTab: (webContents) => {
        const tab = this.browser && this.browser.tabFor(webContents);
        if (tab) {
          this.browser.select(tab);
        }
      },
      removeTab: (webContents) => {
        const tab = this.browser && this.browser.tabFor(webContents);
        if (tab) {
          this.browser.close(tab);
        }
      },
    });
    // The library's service-worker preload, only for extensions' workers.
    try {
      ses.unregisterPreloadScript("crx-mv3-preload");
    } catch (error) {
      // Not there: nothing to replace.
    }
    ses.registerPreloadScript({ id: "noor-crx-mv3-preload", type: "service-worker", filePath: SERVICE_WORKER_PRELOAD });
    this.managers.set(ses, manager);
    ses.extensions.on("extension-loaded", () => this.changed());
    ses.extensions.on("extension-unloaded", () => this.changed());
    for (const entry of this.installed()) {
      if (entry.enabled) {
        ses.extensions.loadExtension(entry.path).catch(() => {});
      }
    }
    if (!this.updater) {
      this.updater = setInterval(() => this.checkUpdates().catch(() => {}), UPDATE_EVERY);
      if (typeof this.updater.unref === "function") {
        this.updater.unref();
      }
      const first = setTimeout(() => this.checkUpdates().catch(() => {}), 60 * 1000);
      if (typeof first.unref === "function") {
        first.unref();
      }
    }
  }

  /// The toolbar's session shows the extensions' icons (crx://).
  showIconsIn(ses) {
    try {
      ElectronChromeExtensions.handleCRXProtocol(ses);
    } catch (error) {
      // Buttons without icons, then.
    }
  }

  /// Loads the extension in `dir` into every profile's session; its ID.
  async loadEverywhere(dir) {
    let id = null;
    for (const ses of this.sessions()) {
      const extension = await ses.extensions.loadExtension(dir);
      id = id || extension.id;
    }
    return id;
  }

  unloadEverywhere(id) {
    for (const ses of this.sessions()) {
      try {
        ses.extensions.removeExtension(id);
      } catch (error) {
        // Not loaded there.
      }
    }
  }

  // MARK: - Adding

  /// The data at `url`, through Chromium's network (the system's proxy).
  async download(url) {
    const response = await net.fetch(url, { cache: "no-store", credentials: "omit" });
    if (!response.ok) {
      throw new Error(`The download failed (${response.status}).`);
    }
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_DOWNLOAD) {
      throw new Error("The extension is too big.");
    }
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > MAX_DOWNLOAD) {
      throw new Error("The extension is too big.");
    }
    return data;
  }

  /// Adds the store's extension `id` (from its page, titled `title`): it
  /// is downloaded from where Chrome downloads it, checked, shown with
  /// what it may do, and added if the user says so. Its name, or null.
  async installFromStore(id, title = "") {
    if (this.isInstalled(id) || this.installing.has(id)) {
      return null;
    }
    this.installing.add(id);
    this.changed();
    try {
      const crx = parseCrx(await this.download(downloadURL(id, process.versions.chrome)));
      if (!crx || crx.id !== id) {
        throw new Error("The store sent another extension than the one asked for.");
      }
      const zip = new AdmZip(crx.zip);
      const manifest = zipManifest(zip);
      const name = displayName(manifest, (locale) => zipJSON(zip, `_locales/${locale}/messages.json`)) || title || id;
      if (!(await this.confirm(name, manifest))) {
        return null;
      }
      const dir = this.unpack(crx, zip, manifest, path.join(this.storeDir, id));
      const loaded = await this.loadEverywhere(dir);
      if (loaded && loaded !== id) {
        throw new Error("The extension loaded under another ID.");
      }
      this.record({ id, path: dir, source: "store", enabled: true });
      this.changed();
      return name;
    } finally {
      this.installing.delete(id);
      this.changed();
    }
  }

  /// Asks before adding, as Chrome does, with what the extension may do.
  async confirm(name, manifest) {
    const can = permissionSummary(manifest);
    const win = this.browser ? this.browser.win : undefined;
    const { response } = await dialog.showMessageBox(win, {
      type: "question",
      buttons: ["Add Extension", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      message: `Add "${name}"?`,
      detail: (can.length ? `It can:\n• ${can.join("\n• ")}\n\n` : "")
        + "It runs in every profile's normal tabs. Extensions that block ads or change how pages look usually work; some Chrome-only features don't.",
    });
    return response === 0;
  }

  /// Writes a checked .crx's zip into `base`/<version>_0, with its public
  /// key in the manifest, so Chromium gives it the same ID as Chrome does.
  unpack(crx, zip, manifest, base) {
    const version = typeof manifest.version === "string" && /^[0-9.]+$/.test(manifest.version) ? manifest.version : "0";
    const dir = path.join(base, `${version}_0`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    zip.extractAllTo(dir, true);
    const file = path.join(dir, "manifest.json");
    const written = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
    if (!written.key) {
      written.key = crx.publicKey.toString("base64");
      fs.writeFileSync(file, JSON.stringify(written, null, 2));
    }
    return dir;
  }

  /// Adds a .crx or .zip file, or a folder with a manifest.json: copied
  /// into the app's data folder and loaded into every profile. Its ID.
  async installFile(file) {
    const stat = fs.statSync(file);
    const dir = path.join(this.localDir, crypto.randomBytes(8).toString("hex"));
    fs.mkdirSync(dir, { recursive: true });
    try {
      let root = dir;
      if (stat.isDirectory()) {
        fs.cpSync(file, dir, { recursive: true });
        root = manifestRoot(dir);
      } else {
        const data = fs.readFileSync(file);
        const crx = parseCrx(data);
        const zip = new AdmZip(crx ? crx.zip : data);
        if (crx) {
          // A .crx keeps its own ID (from its key), as in Chrome: one added
          // before is replaced.
          if (this.isInstalled(crx.id)) {
            await this.remove(crx.id);
          }
          root = this.unpack(crx, zip, zipManifest(zip), dir);
        } else {
          zip.extractAllTo(dir, true);
          root = manifestRoot(dir);
        }
      }
      if (!root) {
        throw new Error("There is no manifest.json in it, so it isn't a web extension.");
      }
      if (!this.sessions().length) {
        throw new Error("Extensions can't run while \"Clear everything on quit\" is on.");
      }
      const id = await this.loadEverywhere(root);
      this.record({ id, path: root, source: "file", enabled: true });
      this.changed();
      return id;
    } catch (error) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw error;
    }
  }

  // MARK: - Changing

  async remove(id) {
    const entry = this.installed().find((e) => e.id === id);
    this.save(this.installed().filter((e) => e.id !== id));
    this.unloadEverywhere(id);
    if (entry) {
      const base = entry.source === "store" ? this.storeDir : this.localDir;
      const relative = path.relative(base, entry.path);
      const top = relative.split(path.sep)[0];
      if (top && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        fs.rmSync(path.join(base, top), { recursive: true, force: true });
      }
    }
    this.changed();
  }

  setEnabled(id, isOn) {
    const entry = this.installed().find((e) => e.id === id);
    if (!entry) {
      return;
    }
    this.record({ ...entry, enabled: Boolean(isOn) });
    if (isOn) {
      for (const ses of this.sessions()) {
        if (!ses.extensions.getExtension(id)) {
          ses.extensions.loadExtension(entry.path).catch(() => {});
        }
      }
    } else {
      this.unloadEverywhere(id);
    }
    this.changed();
  }

  /// Asks the store, as Chrome does, whether its extensions have new
  /// versions, and puts each new one in place of the old.
  async checkUpdates() {
    const fromStore = this.installed().filter((e) => e.source === "store");
    if (!fromStore.length) {
      return 0;
    }
    const versions = new Map(fromStore.map((e) => [e.id, String((readManifest(e.path) || {}).version || "0")]));
    const response = await net.fetch(updateCheckURL(fromStore.map((e) => ({ id: e.id, version: versions.get(e.id) })), process.versions.chrome), { cache: "no-store", credentials: "omit" });
    if (!response.ok) {
      return 0;
    }
    const updates = parseUpdateResponse(await response.text());
    let updated = 0;
    for (const entry of fromStore) {
      const update = updates.get(entry.id);
      if (!update || compareVersions(update.version, versions.get(entry.id)) <= 0) {
        continue;
      }
      try {
        const crx = parseCrx(await this.download(update.codebase));
        if (!crx || crx.id !== entry.id) {
          continue;
        }
        const zip = new AdmZip(crx.zip);
        const dir = this.unpack(crx, zip, zipManifest(zip), path.join(this.storeDir, entry.id));
        if (path.resolve(dir) === path.resolve(entry.path)) {
          continue;
        }
        this.unloadEverywhere(entry.id);
        if (entry.enabled) {
          await this.loadEverywhere(dir);
        }
        this.record({ ...entry, path: dir });
        fs.rmSync(entry.path, { recursive: true, force: true });
        updated++;
      } catch (error) {
        // This one stays as it is until the next check.
      }
    }
    this.changed();
    return updated;
  }

  // MARK: - For the settings, the toolbar and the menus

  /// The installed extensions as the settings show them.
  list() {
    const languages = localeFolders(app.getLocale());
    return this.installed().map((entry) => {
      const manifest = readManifest(entry.path) || {};
      const messages = (locale) => readJSON(path.join(entry.path, "_locales", locale, "messages.json"));
      const page = manifest.options_page || (manifest.options_ui && manifest.options_ui.page) || null;
      const loaded = this.sessions().some((ses) => ses.extensions.getExtension(entry.id));
      return {
        id: entry.id,
        name: displayName(manifest, messages, languages) || entry.id,
        version: typeof manifest.version === "string" ? manifest.version : "",
        description: localized(manifest.description, manifest, messages, languages).slice(0, 200),
        enabled: entry.enabled,
        source: entry.source,
        optionsURL: page && loaded ? `chrome-extension://${entry.id}/${String(page).replace(/^\//, "")}` : null,
        icon: iconDataURL(entry.path, manifest),
      };
    });
  }

  contextMenuItems(tab, params) {
    const manager = this.managers.get(tab.webContents.session);
    try {
      return manager ? manager.getContextMenuItems(tab.webContents, params) : [];
    } catch (error) {
      return [];
    }
  }

  tabCreated(tab) {
    const manager = this.managers.get(tab.webContents.session);
    if (manager && tab.browser && tab.browser.win) {
      try {
        manager.addTab(tab.webContents, tab.browser.win);
      } catch (error) {
        // The tab works without extensions knowing of it.
      }
    }
  }

  tabSelected(tab) {
    const manager = this.managers.get(tab.webContents.session);
    if (manager) {
      try {
        manager.selectTab(tab.webContents);
      } catch (error) {
        // Nothing to do.
      }
    }
  }

  changed() {
    if (this.browser) {
      this.browser.pushState();
    }
  }
}

const readJSON = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch (error) {
    return null;
  }
};

const readManifest = (dir) => readJSON(path.join(dir, "manifest.json"));

const zipJSON = (zip, name) => {
  try {
    const entry = zip.getEntry(name);
    return entry ? JSON.parse(entry.getData().toString("utf8").replace(/^﻿/, "")) : null;
  } catch (error) {
    return null;
  }
};

const zipManifest = (zip) => {
  const manifest = zipJSON(zip, "manifest.json");
  if (!manifest || typeof manifest !== "object") {
    throw new Error("There is no manifest.json in it, so it isn't a web extension.");
  }
  return manifest;
};

const displayName = (manifest, messages, languages = localeFolders(app.getLocale())) =>
  localized(manifest.name, manifest, messages, languages) || localized(manifest.short_name, manifest, messages, languages);

/// The folder holding manifest.json: `dir` itself, or its one folder.
const manifestRoot = (dir) => {
  if (fs.existsSync(path.join(dir, "manifest.json"))) {
    return dir;
  }
  const folders = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== "__MACOSX");
  if (folders.length === 1 && fs.existsSync(path.join(dir, folders[0].name, "manifest.json"))) {
    return path.join(dir, folders[0].name);
  }
  return null;
};

/// The extension's icon nearest 32 pixels, as a data: address.
const iconDataURL = (dir, manifest) => {
  const icons = manifest.icons && typeof manifest.icons === "object" ? manifest.icons : {};
  const sizes = Object.keys(icons).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  const size = sizes.find((n) => n >= 32) || sizes[sizes.length - 1];
  if (!size) {
    return null;
  }
  const file = path.resolve(dir, String(icons[size]).replace(/^\//, ""));
  if (!file.startsWith(path.resolve(dir) + path.sep)) {
    return null;
  }
  const image = nativeImage.createFromPath(file);
  return image.isEmpty() ? null : image.resize({ width: 32, height: 32 }).toDataURL();
};

module.exports = { Extensions, STORE_URL, manifestRoot };
