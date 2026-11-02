"use strict";
const { writeWhole, readWhole } = require("./store");

/// Saved pages, shared by every profile: the bookmarks (favorites on the
/// start page), or the pinned links (a row of their own above them), each
/// list in a file of its own, written whole or not at all.
class Bookmarks {
  constructor(file) {
    this.file = file;
    const parsed = readWhole(file, Array.isArray);
    this.entries = (parsed || []).filter((e) => e && typeof e.url === "string");
  }

  all() {
    return this.entries.slice();
  }

  contains(url) {
    return this.entries.some((e) => e.url === url);
  }

  add(title, url) {
    if (this.contains(url)) {
      return;
    }
    this.entries.push({ url, title: title || url, added: new Date().toISOString() });
    this.save();
  }

  remove(url) {
    this.entries = this.entries.filter((e) => e.url !== url);
    this.save();
  }

  /// Adds the page, or removes it if it is saved. Returns whether it is
  /// saved afterwards.
  toggle(title, url) {
    if (this.contains(url)) {
      this.remove(url);
      return false;
    }
    this.add(title, url);
    return true;
  }

  save() {
    writeWhole(this.file, JSON.stringify(this.entries, null, 2));
  }
}

module.exports = { Bookmarks };
