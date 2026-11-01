"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const android = require("../main/android");
const mobile = require("../main/mobile");
const { Fingerprint, ANDROID_KINDS } = require("../main/fingerprint");
const { Profiles } = require("../main/profiles");
const { tempStore } = require("./helpers");

const named = (name) => android.PHONES.concat(android.TABLETS).find((d) => d.name === name);

test("the Android phones and tablets, each whole: 40 phones upright, tablets sideways, each with the processor it came out with", () => {
  assert.equal(android.PHONES.length, 40);
  assert.equal(android.TABLETS.length, 8);
  const all = android.PHONES.concat(android.TABLETS);
  assert.equal(new Set(all.map((d) => d.name)).size, all.length);
  assert.equal(new Set(all.map((d) => d.model)).size, all.length);
  for (const d of all) {
    assert.ok(d.model && typeof d.model === "string", d.name);
    assert.ok([1.5, 2, 2.625, 2.75, 2.8125, 3, 3.5].includes(d.scale), d.name);
    assert.ok(d.family === "phone" ? d.width < d.height : d.width > d.height, d.name);
    assert.ok(d.pageHeight < d.height && d.pageWidth === d.width && d.fullHeight === d.height, d.name);
    assert.ok([4, 8].includes(d.memory), d.name);
    assert.equal(d.platform, d.memory >= 8 ? "Linux aarch64" : "Linux armv8l", d.name);
    assert.ok([5, 10].includes(d.touchPoints), d.name);
    // Its graphics and cores are its processor's.
    const soc = android.SOCS[d.soc];
    assert.ok(soc, d.name + ": " + d.soc);
    assert.deepEqual([d.gpuVendor, d.gpu, d.cores], soc, d.name);
    assert.equal(d.gpuVendor === "Qualcomm" ? /^Adreno \(TM\) \d{3}L?$/.test(d.gpu) : /^Mali-G\d+( MC\d+)?$/.test(d.gpu), true, d.name);
    // A MediaTek chip's Mali tells its core count, a Samsung's or a Google's doesn't.
    if (d.gpuVendor === "ARM") assert.equal(/ MC\d$/.test(d.gpu), /^(Helio|Dimensity)/.test(d.soc), d.name);
    assert.match(d.android, /^1[3-5]$/);
  }
  assert.equal(named("Google Pixel 7").width, 412);
  assert.equal(named("Samsung Galaxy Tab S9").model, "SM-X710");
  assert.deepEqual([named("Google Pixel 8").cores, named("Google Pixel 9").cores], [9, 8]);
  assert.deepEqual([named("Samsung Galaxy A15").soc, named("Samsung Galaxy A15").gpu], ["Helio G99", "Mali-G57 MC2"]);
  assert.equal(named("Samsung Galaxy S25").gpu, "Adreno (TM) 830");
});

test("a device's graphics card as Chrome on Android tells it: through ANGLE in WebGL, its maker and family in WebGPU", () => {
  const s23 = android.graphicsOf(named("Samsung Galaxy S23"));
  assert.deepEqual([s23.vendor, s23.renderer], ["Google Inc. (Qualcomm)", "ANGLE (Qualcomm, Adreno (TM) 740, OpenGL ES 3.2)"]);
  assert.deepEqual(s23.webgpu, { vendor: "qualcomm", architecture: "adreno-7xx", subgroupMinSize: 64, subgroupMaxSize: 128 });
  assert.equal(android.graphicsOf(named("Xiaomi POCO X5 Pro 5G")).webgpu.architecture, "adreno-6xx");
  assert.equal(android.graphicsOf(named("Samsung Galaxy S25")).webgpu.architecture, "adreno-8xx");
  const a15 = android.graphicsOf(named("Samsung Galaxy A15"));
  assert.deepEqual([a15.vendor, a15.renderer, a15.family], ["Google Inc. (ARM)", "ANGLE (ARM, Mali-G57 MC2, OpenGL ES 3.2)", "mali"]);
  assert.deepEqual(a15.webgpu, { vendor: "arm", architecture: "valhall", subgroupMinSize: 16, subgroupMaxSize: 16 });
  assert.equal(android.graphicsOf(named("Xiaomi Redmi 13C")).webgpu.architecture, "bifrost");
  // With WebGL Vendor & Renderer off, a page is told no card: it shows this PC's.
  assert.equal(android.pageConfig(named("Samsung Galaxy S23"), { graphics: false }).graphics, null);
  assert.deepEqual(android.pageConfig(named("Samsung Galaxy S23")).graphics, s23);
});

test("a profile's Android fonts: a pick of Android's Noto fonts of its own, all of them with Fonts off", () => {
  const all = android.fontsOf(null);
  assert.equal(all.add.length, android.NOTO_FONTS.length);
  assert.deepEqual(all.block, []);
  const picks = new Set();
  for (let seed = 1; seed < 400; seed++) {
    const fonts = android.fontsOf(seed * 2654435761);
    assert.deepEqual(fonts, android.fontsOf(seed * 2654435761));
    assert.ok(fonts.add.length >= 12, String(fonts.add.length));
    assert.equal(fonts.add.length + fonts.block.length, android.NOTO_FONTS.length);
    for (const [name, local] of fonts.add) assert.ok(/^Noto /.test(name) && local, name);
    picks.add(fonts.add.map((font) => font[0]).join(","));
  }
  assert.equal(picks.size, 399);
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
  const tablet = android.userAgentMetadata(named("Samsung Galaxy Tab A9+"), { brandList, fullVersionList });
  assert.deepEqual([tablet.mobile, tablet.model, tablet.formFactors[0]], [false, "SM-X210", "Tablet"]);
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
  assert.deepEqual(fingerprint.kinds, ANDROID_KINDS);
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

test("Noor Android's WebGL Vendor & Renderer is a switch, on at first, with no seed; its Fonts are new with New", () => {
  const store = tempStore();
  const profiles = new Profiles(store);
  const fingerprint = new Fingerprint(store, profiles, { android: true });
  assert.equal(fingerprint.isEnabled("gpu"), true);
  assert.equal(fingerprint.isEnabled("fonts"), true);
  const before = fingerprint.signature();
  fingerprint.newSeeds(["gpu"]);
  assert.equal(store.get(fingerprint.seedKey("gpu")), undefined);
  assert.equal(fingerprint.signature(), before);
  fingerprint.setEnabled("gpu", false);
  assert.equal(fingerprint.isEnabled("gpu"), false);
  assert.notEqual(fingerprint.signature(), before);
  // A new fonts seed is another pick of fonts.
  for (let i = 0; i < 5; i++) {
    const fonts = android.fontsOf(fingerprint.seed("fonts")).add.map((font) => font[0]).join(",");
    fingerprint.newSeeds(["fonts"]);
    assert.notEqual(android.fontsOf(fingerprint.seed("fonts")).add.map((font) => font[0]).join(","), fonts);
  }
  // Noor iPhone has neither switch.
  const iphoneFingerprint = new Fingerprint(tempStore(), new Profiles(tempStore()), { iphone: true });
  assert.ok(!iphoneFingerprint.kinds.includes("gpu") && !iphoneFingerprint.kinds.includes("fonts"));
});

test("a profile made with Noor Android 1.0.37 keeps its phone or tablet now the lists are longer", () => {
  const store = tempStore();
  const profiles = new Profiles(store);
  const fingerprint = new Fingerprint(store, profiles, { android: true });
  // Its seed picked the 8th phone of the old list of 15: the Pixel 7.
  store.set(fingerprint.seedKey("device"), 15 * 1000 + 7);
  assert.equal(fingerprint.iphone().name, "Google Pixel 7");
  assert.equal(store.get(fingerprint.catalogKey()), android.CATALOG);
  assert.equal(fingerprint.iphone().name, "Google Pixel 7");
  // A tablet: the old third one, the Galaxy Tab A8, is the Tab A9+ now.
  const tablet = fingerprint.forProfile("tablet-profile");
  store.set(tablet.familyKey(), "tablet");
  store.set(tablet.seedKey("device"), 8 * 77 + 2);
  assert.equal(tablet.iphone().name, "Samsung Galaxy Tab A9+");
  // A profile made now picks from today's lists, and stays its device.
  const fresh = new Fingerprint(tempStore(), new Profiles(tempStore()), { android: true });
  const first = fresh.iphone().name;
  assert.equal(fresh.iphone().name, first);
  fresh.newSeeds(["device"]);
  const second = fresh.iphone().name;
  assert.notEqual(second, first);
  assert.equal(fresh.iphone().name, second);
});
