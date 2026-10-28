"use strict";
const crypto = require("crypto");

/// The profile the app started with. It keeps the data and fingerprints of
/// earlier versions, and can't be deleted.
const DEFAULT_ID = "default";

/// Browsing profiles: each has its own cookies and website data (a
/// Chromium partition), history, open tabs and fingerprints, so one
/// person's accounts, or one purpose, stay apart from another's.
/// Bookmarks and the settings are shared.
class Profiles {
  constructor(store, defaultName = "Personal") {
    this.store = store;
    this.defaultName = defaultName;
  }

  /// Every profile, the default one first.
  all() {
    let saved = this.store.get("profiles", []);
    if (!Array.isArray(saved)) {
      saved = [];
    }
    const others = saved
      .filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && p.id !== DEFAULT_ID)
      .map((p) => ({ id: p.id, name: p.name, isDefault: false }));
    return [{ id: DEFAULT_ID, name: this.defaultName, isDefault: true }].concat(others);
  }

  /// The profile in use.
  current() {
    const all = this.all();
    const id = this.store.get("currentProfile");
    return all.find((p) => p.id === id) || all[0];
  }

  find(id) {
    return this.all().find((p) => p.id === id) || null;
  }

  select(id) {
    this.store.set("currentProfile", id);
  }

  add(name) {
    const profile = { id: crypto.randomUUID(), name };
    this.saveOthers(this.all().filter((p) => !p.isDefault).concat([profile]));
    return { ...profile, isDefault: false };
  }

  saveOthers(list) {
    this.store.set("profiles", list.map((p) => ({ id: p.id, name: p.name })));
  }

  /// The store key of a value kept per profile: `base` itself for the
  /// default profile and a prefixed key for any other.
  key(base, profile = this.current()) {
    return profile.isDefault ? base : `profile.${profile.id}.${base}`;
  }

  /// The Chromium partition that holds a profile's website data: kept on
  /// disk, or with `inMemory` (Clear Everything on Quit) only while the
  /// app runs.
  partition(profile, inMemory = false) {
    const name = `noor-${profile.id}`;
    return inMemory ? name : `persist:${name}`;
  }

  /// The file a profile's history is kept in, in the app's data folder.
  historyFile(profile) {
    return profile.isDefault ? "history.json" : `history-${profile.id}.json`;
  }

  /// Forgets a profile: its entry, its per-profile values (fingerprints,
  /// remembered tabs) and, at the next launch, its partition folder. The
  /// caller clears its website data and history. The default profile stays.
  remove(id) {
    if (id === DEFAULT_ID) {
      return;
    }
    this.saveOthers(this.all().filter((p) => !p.isDefault && p.id !== id));
    if (this.store.get("currentProfile") === id) {
      this.select(DEFAULT_ID);
    }
    const prefix = `profile.${id}.`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
    const doomed = this.store.get("doomedPartitions", []);
    this.store.set("doomedPartitions", doomed.concat([`noor-${id}`]));
  }
}

module.exports = { Profiles, DEFAULT_ID };
