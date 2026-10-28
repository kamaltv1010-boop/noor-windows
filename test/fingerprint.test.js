"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Fingerprint, KINDS, SCREENS } = require("../main/fingerprint");
const { Profiles } = require("../main/profiles");
const { tempStore } = require("./helpers");

const make = () => {
  const store = tempStore();
  const profiles = new Profiles(store);
  const fingerprint = new Fingerprint(store, profiles);
  fingerprint.realScreen = { width: 1920, height: 1080 };
  return { store, profiles, fingerprint };
};

test("seeds are made once and kept", () => {
  const { fingerprint } = make();
  const first = fingerprint.seed("canvas");
  assert.equal(fingerprint.seed("canvas"), first);
  assert.ok(Number.isInteger(first) && first >= 0 && first < 2 ** 32);
});

test("a new seed changes the screen size and hardware pages see", () => {
  const { fingerprint } = make();
  for (let i = 0; i < 20; i++) {
    const screen = fingerprint.visibleValue(fingerprint.seed("screen"), "screen");
    fingerprint.newSeed("screen");
    assert.notEqual(fingerprint.visibleValue(fingerprint.seed("screen"), "screen"), screen);
    const hardware = fingerprint.hardware().cores;
    fingerprint.newSeed("hardware");
    assert.notEqual(fingerprint.hardware().cores, hardware);
  }
});

test("screens pages see are at least as big as this PC's", () => {
  const { fingerprint } = make();
  for (const screen of fingerprint.screens()) {
    assert.ok(screen.width >= 1920 && screen.height >= 1080);
  }
  fingerprint.realScreen = { width: 5120, height: 2880 };
  assert.deepEqual(fingerprint.screens(), [SCREENS[SCREENS.length - 1]]);
});

test("seeds are per profile", () => {
  const { fingerprint, profiles } = make();
  const first = fingerprint.seed("canvas");
  const other = profiles.add("Other");
  profiles.select(other.id);
  assert.notEqual(fingerprint.seed("canvas"), first);
  profiles.select("default");
  assert.equal(fingerprint.seed("canvas"), first);
});

test("config: everything with shields up (audio off at first), nothing with shields down, real device on sign-in sites", () => {
  const { fingerprint } = make();
  assert.equal(fingerprint.isEnabled("audio"), false);
  assert.equal(fingerprint.config().seeds.audio, null);
  fingerprint.setEnabled("audio", true);
  const full = fingerprint.config();
  for (const kind of ["canvas", "webGL", "audio", "clientRects"]) {
    assert.ok(Number.isInteger(full.seeds[kind]));
  }
  assert.ok(full.screen.width > 0 && full.hardware.cores > 0);
  const down = fingerprint.config({ protections: false });
  assert.deepEqual(down, { seeds: { canvas: null, webGL: null, audio: null, clientRects: null }, screen: null, hardware: null });
  const signIn = fingerprint.config({ realDevice: true });
  assert.equal(signIn.screen, null);
  assert.equal(signIn.hardware, null);
  assert.equal(signIn.seeds.canvas, full.seeds.canvas);
  fingerprint.setEnabled("canvas", false);
  assert.equal(fingerprint.config().seeds.canvas, null);
});

test("the signature changes with a switch or a seed", () => {
  const { fingerprint } = make();
  const first = fingerprint.signature();
  assert.equal(fingerprint.signature(), first);
  fingerprint.newSeeds(["audio"]);
  const second = fingerprint.signature();
  assert.notEqual(second, first);
  fingerprint.setEnabled("webGL", false);
  assert.notEqual(fingerprint.signature(), second);
  assert.equal(KINDS.length, 6);
});
