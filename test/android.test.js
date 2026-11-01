"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const android = require("../main/android");
const mobile = require("../main/mobile");
const { Fingerprint, IPHONE_KINDS } = require("../main/fingerprint");
const { Profiles } = require("../main/profiles");
const { tempStore } = require("./helpers");

const named = (name) => android.PHONES.concat(android.TABLETS).find((d) => d.name === name);

test("the Android phones and tablets, each whole: phones upright, tablets sideways, their models and cards as Chrome tells them", () => {
  assert.ok(android.PHONES.length >= 12 && android.TABLETS.length >= 6);
  const all = android.PHONES.concat(android.TABLETS);
  assert.equal(new Set(all.map((d) => d.name)).size, all.length);
  for (const d of all) {
    assert.ok(d.model && typeof d.model === "string", d.name);
    assert.ok([1.5, 2, 2.625, 2.75, 2.8125, 3, 3.5].includes(d.scale), d.name);
    assert.ok(d.family === "phone" ? d.width < d.height : d.width > d.height, d.name);
    assert.ok(d.pageHeight < d.height && d.pageWidth === d.width && d.fullHeight === d.height, d.name);
    assert.ok([4, 8].includes(d.memory), d.name);
    assert.equal(d.platform, d.memory >= 8 ? "Linux aarch64" : "Linux armv8l", d.name);
    assert.ok([5, 10].includes(d.touchPoints), d.name);
    assert.equal(d.gpuVendor === "Qualcomm" ? /^Adreno \(TM\) \d+$/.test(d.gpu) : /^Mali-G\d+$/.test(d.gpu), true, d.name);
    assert.match(d.android, /^1[3-5]$/);
  }
  assert.equal(named("Google Pixel 7").width, 412);
  assert.equal(named("Samsung Galaxy Tab S9").model, "SM-X710");
});

test("Chrome on Android's reduced user agent: Mobile on a phone, not on a tablet", () => {
  const major = android.chromeMajor();
  assert.equal(android.userAgent(named("Samsung Galaxy S23")), `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36`);
  assert.equal(android.userAgent(named("Google Pixel Tablet")), `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`);
});

test("Chrome's client hints for a device: Android and its version, the model, a phone or a tablet, no architecture", () => {
  const brandList = [{ brand: "Google Chrome", version: "156" }];
  const fullVersionList = [{ brand: "Google Chrome", version: "156.0.1.2" }];
  const phone = android.userAgentMetadata(named("Google Pixel 8"), { brandList, fullVersionList });
  assert.deepEqual([phone.platform, phone.platformVersion, phone.model, phone.mobile, phone.architecture, phone.bitness, phone.wow64], ["Android", "15.0.0", "Pixel 8", true, "", "", false]);
  assert.deepEqual(phone.formFactors, ["Mobile"]);
  assert.deepEqual(phone.brands, brandList);
  const tablet = android.userAgentMetadata(named("Samsung Galaxy Tab A8"), { brandList, fullVersionList });
  assert.deepEqual([tablet.mobile, tablet.model, tablet.formFactors[0]], [false, "SM-X200", "Tablet"]);
  // A request no tab's override covered (a service worker's) gets them too.
  const headers = android.hintHeaders({ "sec-ch-ua": '"Chromium";v="156"', "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Windows"', "Sec-CH-UA-Model": '""', "User-Agent": "x" }, named("Google Pixel 8"));
  assert.deepEqual(headers, { "sec-ch-ua": '"Chromium";v="156"', "sec-ch-ua-mobile": "?1", "sec-ch-ua-platform": '"Android"', "Sec-CH-UA-Model": '"Pixel 8"', "User-Agent": "x" });
});

test("Chromium is told a phone's page upright and a tablet's sideways, as phones' pages, drawn smaller where asked", () => {
  const phone = android.deviceMetrics(named("Google Pixel 7"));
  assert.deepEqual([phone.width, phone.height, phone.deviceScaleFactor, phone.mobile, phone.screenWidth, phone.screenHeight], [412, named("Google Pixel 7").pageHeight, 2.625, true, 412, 915]);
  assert.deepEqual(phone.screenOrientation, { type: "portraitPrimary", angle: 0 });
  const tablet = android.deviceMetrics(named("Samsung Galaxy Tab S9"), 600, 0.8);
  assert.deepEqual([tablet.width, tablet.height, tablet.screenWidth, tablet.screenHeight, tablet.scale], [1280, 600, 1280, 800, 0.8]);
  assert.deepEqual(tablet.screenOrientation, { type: "landscapePrimary", angle: 0 });
});

test("a profile's battery: its own, between a third and nearly full", () => {
  assert.deepEqual(android.batteryOf(42), android.batteryOf(42));
  let charging = 0;
  for (let seed = 0; seed < 500; seed++) {
    const battery = android.batteryOf(seed * 7919);
    assert.ok(battery.level >= 0.35 && battery.level <= 0.95, String(battery.level));
    if (battery.charging) charging++;
  }
  assert.ok(charging > 50 && charging < 150, String(charging));
});

test("the builds: Noor, Noor iPhone and Noor Android, each with its kinds of device and its name", () => {
  const saved = process.env.NOOR_DEVICE;
  try {
    process.env.NOOR_DEVICE = "android";
    assert.equal(mobile.build(), "android");
    process.env.NOOR_DEVICE = "iphone";
    assert.equal(mobile.build(), "iphone");
    process.env.NOOR_DEVICE = "windows";
    assert.equal(mobile.build(), "windows");
  } finally {
    if (saved === undefined) delete process.env.NOOR_DEVICE;
    else process.env.NOOR_DEVICE = saved;
  }
  assert.deepEqual(mobile.familiesOf("android"), ["phone", "tablet"]);
  assert.deepEqual(mobile.familiesOf("iphone"), ["iphone", "ipad"]);
  assert.deepEqual(mobile.familiesOf("windows"), []);
  assert.deepEqual([mobile.product("android"), mobile.appId("android"), mobile.product("iphone"), mobile.appId("windows")], ["Noor Android", "ma.noor.android", "Noor iPhone", "ma.noor.browser"]);
  assert.deepEqual([mobile.kindName("tablet"), mobile.kindPlural("phone"), mobile.kindName("ipad")], ["Tablet", "Phones", "iPad"]);
  assert.equal(mobile.firstDevice("android").family, "phone");
  assert.equal(mobile.userAgent(named("Google Pixel 7")), android.userAgent(named("Google Pixel 7")));
  assert.match(mobile.userAgent(mobile.firstDevice("iphone")), /iPhone/);
});

test("in Noor Android a profile is a phone at first; made a tablet, its device and every new one are tablets", () => {
  const store = tempStore();
  const profiles = new Profiles(store);
  const fingerprint = new Fingerprint(store, profiles, { android: true });
  assert.deepEqual(fingerprint.kinds, IPHONE_KINDS);
  assert.deepEqual(fingerprint.families, ["phone", "tablet"]);
  assert.equal(fingerprint.family(), "phone");
  assert.equal(fingerprint.iphone().family, "phone");
  fingerprint.setFamily("tablet");
  for (let i = 0; i < 6; i++) {
    const before = fingerprint.iphone().name;
    fingerprint.newSeeds(["device"]);
    assert.equal(fingerprint.iphone().family, "tablet");
    assert.notEqual(fingerprint.iphone().name, before);
  }
  // An iPhone's kind isn't one of Noor Android's: a phone.
  fingerprint.setFamily("ipad");
  assert.equal(fingerprint.family(), "phone");
  const config = fingerprint.config({ realDevice: true });
  assert.equal(config.screen, null);
  assert.ok(config.seeds.canvas !== null && config.seeds.audio !== null);
});
