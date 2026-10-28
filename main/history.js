"use strict";
const fs = require("fs");
const path = require("path");

/// The pages visited, newest first, one file per profile.
class History {
  constructor(file, limit = 3000) {
    this.file = file;
    this.limit = limit;
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

  record(url, title = "") {
    this.entries = this.entries.filter((e) => e.url !== url);
    this.entries.unshift({ url, title: title || url, visited: new Date().toISOString() });
    if (this.entries.length > this.limit) {
      this.entries.length = this.limit;
    }
    this.save();
  }

  updateTitle(title, url) {
    const entry = this.entries.find((e) => e.url === url);
    if (entry && title && entry.title !== title) {
      entry.title = title;
      this.save();
    }
  }

  /// Entries whose address or title contains every word of `query`.
  search(query, limit = 50) {
    const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    const matches = this.entries.filter((e) => {
      const text = (e.url + " " + e.title).toLowerCase();
      return words.every((word) => text.includes(word));
    });
    return matches.slice(0, limit);
  }

  remove(url) {
    this.entries = this.entries.filter((e) => e.url !== url);
    this.save();
  }

  clear() {
    this.entries = [];
    this.save();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.entries));
    } catch (error) {
      // Kept in memory for this run.
    }
  }
}

module.exports = { History };
