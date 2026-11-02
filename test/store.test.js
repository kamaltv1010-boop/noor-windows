"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Store } = require("../main/store");

const tempFile = (name) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "noor-store-")), name);

test("store: what is set is read again from the disk, and nothing is left beside the file", () => {
  const file = tempFile("settings.json");
  const store = new Store(file);
  store.set("profiles", [{ id: "default", name: "Personal" }]);
  store.set("cleanLinks", false);
  store.delete("cleanLinks");
  const again = new Store(file);
  assert.deepEqual(again.get("profiles"), [{ id: "default", name: "Personal" }]);
  assert.equal(again.get("cleanLinks", "none"), "none");
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), again.data);
});

test("store: a write cut short leaves the last whole file, never half of one", () => {
  const file = tempFile("settings.json");
  const store = new Store(file);
  store.set("profiles", [{ id: "default", name: "Personal" }, { id: "p2", name: "Second" }]);
  // The computer stopped while the next write was under way: half of it
  // beside the file, never put in its place.
  fs.writeFileSync(`${file}.tmp`, '{\n  "profiles": [\n    { "id": "def');
  const again = new Store(file);
  assert.deepEqual(again.get("profiles").map((p) => p.name), ["Personal", "Second"]);
});

test("store: a whole write not yet put in its place is the newest, and is read", () => {
  const file = tempFile("settings.json");
  const store = new Store(file);
  store.set("currentProfile", "default");
  // Written and flushed, then the computer stopped before the rename.
  fs.writeFileSync(`${file}.tmp`, JSON.stringify({ currentProfile: "p2" }));
  const again = new Store(file);
  assert.equal(again.get("currentProfile"), "p2");
  // Its next write puts a whole file in place, and nothing beside it.
  again.set("cleanLinks", true);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  assert.deepEqual(new Store(file).data, { currentProfile: "p2", cleanLinks: true });
});

test("store: no file, or a file that doesn't read, starts empty", () => {
  const file = tempFile("settings.json");
  assert.deepEqual(new Store(file).data, {});
  fs.writeFileSync(file, "[1, 2]");
  assert.deepEqual(new Store(file).data, {});
});

test("bookmarks and pinned links: kept whole on the disk, a write cut short leaves the last list", () => {
  const { Bookmarks } = require("../main/bookmarks");
  const file = tempFile("pins.json");
  const pins = new Bookmarks(file);
  pins.add("Instagram", "https://www.instagram.com/");
  pins.add("Example", "https://example.com/");
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  // The computer stopped while the next write was under way.
  fs.writeFileSync(`${file}.tmp`, '[{"url": "https://www.inst');
  assert.deepEqual(new Bookmarks(file).all().map((p) => p.title), ["Instagram", "Example"]);
  // Or just before a whole one was put in place: that one is the newest.
  fs.writeFileSync(`${file}.tmp`, JSON.stringify([{ url: "https://www.instagram.com/", title: "Instagram" }]));
  assert.deepEqual(new Bookmarks(file).all().map((p) => p.url), ["https://www.instagram.com/"]);
});
