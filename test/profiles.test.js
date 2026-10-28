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
