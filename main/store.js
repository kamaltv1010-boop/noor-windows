"use strict";
const fs = require("fs");
const path = require("path");

/// Writes `text` as the whole of `file`, or leaves the file as it was: it
/// is written beside its place (`.tmp`), flushed to the disk, then put in
/// its place. A write cut short (Windows ending the session or restarting
/// for an update, a power cut) once left half a file, read as nothing.
const writeWhole = (file, text) => {
  const temp = `${file}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fd = fs.openSync(temp, "w");
    try {
      fs.writeSync(fd, text);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, file);
  } catch (error) {
    // (Windows may hold the file a moment, its antivirus reading it: then
    // it is written in its place, as before.)
    try {
      fs.rmSync(temp, { force: true });
      fs.writeFileSync(file, text);
    } catch (e) {
      // Nothing to do: what it holds stays in memory for this run.
    }
  }
};

/// What `file` holds, as JSON, if `accept` takes it; null otherwise. A
/// `.tmp` left whole beside it (the computer stopped just before it was put
/// in place, see writeWhole) is the newest, and read first.
const readWhole = (file, accept) => {
  for (const candidate of [`${file}.tmp`, file]) {
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (accept(parsed)) {
        return parsed;
      }
    } catch (error) {
      // Not there, or not whole: the next one.
    }
  }
  return null;
};

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/// Settings and other small state, as one JSON file in the app's data
/// folder, like the iOS app's UserDefaults. Reads come from memory; every
/// write saves the file, whole or not at all (see writeWhole): it holds the
/// profiles, their tabs and every setting, and half a file would read as
/// none of them, every profile forgotten.
class Store {
  constructor(file) {
    this.file = file;
    this.data = readWhole(file, isObject) || {};
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
    writeWhole(this.file, JSON.stringify(this.data, null, 2));
  }
}

module.exports = { Store, writeWhole, readWhole };
