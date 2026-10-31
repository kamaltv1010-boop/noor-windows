"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Profiles, DEFAULT_ID } = require("../main/profiles");
const { tempStore } = require("./helpers");

test("the default profile is always first and in use at first", () => {
  const profiles = new Profiles(tempStore());
  assert.deepEqual(profiles.all(), [{ id: DEFAULT_ID, name: "Personal", isDefault: true }]);
  assert.equal(profiles.current().id, DEFAULT_ID);
});

test("adding, selecting and removing profiles", () => {
  const store = tempStore();
  const profiles = new Profiles(store);
  const work = profiles.add("Work");
  assert.equal(profiles.all().length, 2);
  assert.equal(work.isDefault, false);
  profiles.select(work.id);
  assert.equal(profiles.current().id, work.id);
  assert.equal(profiles.key("seed.canvas"), `profile.${work.id}.seed.canvas`);
  assert.equal(profiles.key("seed.canvas", profiles.find(DEFAULT_ID)), "seed.canvas");
  assert.equal(profiles.partition(work), `persist:noor-${work.id}`);
  assert.equal(profiles.partition(work, true), `noor-${work.id}`);
  assert.equal(profiles.historyFile(work), `history-${work.id}.json`);
  assert.equal(profiles.historyFile(profiles.find(DEFAULT_ID)), "history.json");

  store.set(profiles.key("seed.canvas"), 123);
  profiles.remove(work.id);
  assert.equal(profiles.all().length, 1);
  assert.equal(profiles.current().id, DEFAULT_ID);
  assert.equal(store.get(`profile.${work.id}.seed.canvas`), undefined);
  assert.deepEqual(store.get("doomedPartitions"), [`noor-${work.id}`]);
  profiles.remove(DEFAULT_ID);
  assert.equal(profiles.all().length, 1);
});

test("a broken saved list still gives the default profile", () => {
  const store = tempStore();
  store.set("profiles", "nonsense");
  const profiles = new Profiles(store);
  assert.equal(profiles.all().length, 1);
  store.set("profiles", [{ id: 5 }, { id: "x", name: "X" }]);
  assert.deepEqual(profiles.all().map((p) => p.name), ["Personal", "X"]);
});

test("several profiles at once: numbered after the profiles there are, each name once, the one in use kept", () => {
  const store = tempStore();
  const profiles = new Profiles(store);
  const second = profiles.add("Profile 2");
  profiles.select(second.id);
  const made = profiles.addMany(3);
  assert.deepEqual(made.map((p) => p.name), ["Profile 3", "Profile 4", "Profile 5"]);
  assert.ok(made.every((p) => !p.isDefault && typeof p.id === "string"));
  assert.equal(new Set(made.map((p) => p.id)).size, 3);
  assert.equal(profiles.all().length, 5);
  assert.equal(profiles.current().id, second.id);
  // A name of one's own, numbered from 1, and on from its highest number.
  assert.deepEqual(profiles.addMany(2, "  Insta  ").map((p) => p.name), ["Insta 1", "Insta 2"]);
  assert.deepEqual(profiles.addMany(2, "Insta 9").map((p) => p.name), ["Insta 3", "Insta 4"]);
  // A name taken already is passed over.
  profiles.add("Shop 2");
  assert.deepEqual(profiles.addMany(3, "Shop").map((p) => p.name), ["Shop 3", "Shop 4", "Shop 5"]);
  assert.deepEqual(profiles.addMany(1, "a.b (c)").map((p) => p.name), ["a.b (c) 1"]);
  // At most MAX_AT_ONCE; nothing for nothing.
  const { MAX_AT_ONCE } = require("../main/profiles");
  assert.equal(profiles.addMany(1000).length, MAX_AT_ONCE);
  assert.deepEqual(profiles.addMany(0), []);
  assert.deepEqual(profiles.addMany("ten"), []);
  // Kept as any profile is.
  assert.equal(new Profiles(store).all().length, profiles.all().length);
});
