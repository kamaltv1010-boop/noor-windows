"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { History } = require("../main/history");
const { Bookmarks } = require("../main/bookmarks");

const tempFile = (name) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "noor-test-")), name);

test("history: newest first, one entry per address, titles updated, searched, capped, kept on disk", () => {
  const file = tempFile("history.json");
  const history = new History(file, 3);
  history.record("https://a.com/", "A");
  history.record("https://b.com/", "B");
  history.record("https://a.com/", "A again");
  assert.deepEqual(history.all().map((e) => e.url), ["https://a.com/", "https://b.com/"]);
  history.updateTitle("Bee", "https://b.com/");
  assert.equal(history.search("bee")[0].url, "https://b.com/");
  history.record("https://c.com/", "C");
  history.record("https://d.com/", "D");
  assert.equal(history.all().length, 3);
  assert.equal(new History(file).all().length, 3);
  history.remove("https://d.com/");
  assert.equal(history.all().length, 2);
  history.clear();
  assert.equal(new History(file).all().length, 0);
});

test("bookmarks: add, toggle, remove, kept on disk", () => {
  const file = tempFile("bookmarks.json");
  const bookmarks = new Bookmarks(file);
  assert.equal(bookmarks.toggle("A", "https://a.com/"), true);
  assert.equal(bookmarks.contains("https://a.com/"), true);
  bookmarks.add("A", "https://a.com/");
  assert.equal(bookmarks.all().length, 1);
  assert.equal(new Bookmarks(file).contains("https://a.com/"), true);
  assert.equal(bookmarks.toggle("A", "https://a.com/"), false);
  assert.equal(bookmarks.all().length, 0);
});
