"use strict";
const fs = require("fs");
const path = require("path");

/// Reads `file` as a JSON object, or null.
const readObject = (file) => {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
};

/// Settings and other small state, as one JSON file in the app's data
/// folder, like the iOS app's UserDefaults. Reads come from memory; every
/// write saves the file.
///
/// The file holds the profiles, their tabs and every setting: a write cut
/// short (Windows ending the session or restarting for an update, a power
/// cut) once left half a file, read as nothing, every profile forgotten.
/// So a write is whole or not at all: the file is written beside its place
/// (`.tmp`), flushed to the disk, then put in its place. A `.tmp` left
/// whole (the computer stopped just before it was put in place) is the
/// newest, and read first.
class Store {
  constructor(file) {
    this.file = file;
    this.temp = `${file}.tmp`;
    this.data = readObject(this.temp) || readObject(file) || {};
  }

  get(key, fallback) {
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : fallback;
  }

  set(key, value) {
    if (value === undefined) {
      delete this.data[key];
    } else {
      this.data[key] = value;
    }
    this.save();
  }

  delete(key) {
    delete this.data[key];
    this.save();
  }

  keys() {
    return Object.keys(this.data);
  }

  save() {
    const text = JSON.stringify(this.data, null, 2);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const fd = fs.openSync(this.temp, "w");
      try {
        fs.writeSync(fd, text);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(this.temp, this.file);
    } catch (error) {
      // (Windows may hold the file a moment, its antivirus reading it: then
      // it is written in its place, as before.)
      try {
        fs.rmSync(this.temp, { force: true });
        fs.writeFileSync(this.file, text);
      } catch (e) {
        // Nothing to do: the settings stay in memory for this run.
      }
    }
  }
}

module.exports = { Store };
