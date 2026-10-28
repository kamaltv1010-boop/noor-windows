"use strict";
const fs = require("fs");
const path = require("path");

/// Saved pages, shared by every profile, shown as favorites on the start
/// page.
class Bookmarks {
  constructor(file) {
    this.file = file;
    this.entries = [];
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(parsed)) {
        this.entries = parsed.filter((e) => e && typeof e.url === "string");
      }
    } catch (error) {
      this.entries = [];
    }
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
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.entries, null, 2));
    } catch (error) {
      // Kept in memory for this run.
    }
  }
}

module.exports = { Bookmarks };
