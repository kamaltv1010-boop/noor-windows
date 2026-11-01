"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const iphone = require("../main/iphone");
const { Fingerprint, IPHONE_KINDS } = require("../main/fingerprint");
const { Profiles } = require("../main/profiles");
const { tempStore } = require("./helpers");

const byName = (name) => iphone.IPHONES.find((d) => d.name === name);

test("the iPhones are the iPhone app's, each whole", () => {
  assert.equal(iphone.IPHONES.length, 20);
  for (const d of iphone.IPHONES) {
    assert.ok(d.width >= 375 && d.height >= 667 && [2, 3].includes(d.scale), d.name);
    assert.ok(d.pageHeight < d.height, d.name);
    assert.match(d.iOS, /^\d+\.\d+(\.\d+)?$/);
  }
  assert.equal(byName("iPhone SE (2nd generation)").scale, 2);
  assert.equal(byName("iPhone XR").hdr, false);
  assert.equal(byName("iPhone 13").hdr, true);
});

test("Safari's user agent, with iOS 26's frozen system version", () => {
  assert.equal(iphone.userAgent(byName("iPhone 13")), "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1");
  assert.match(iphone.userAgent(byName("iPhone 16 Pro Max")), /iPhone OS 18_7 like Mac OS X.*Version\/26\.2 /);
});

test("one language, with its region, as Safari tells it", () => {
  assert.equal(iphone.languageTag(["fr-FR", "en-US"]), "fr-FR");
  assert.equal(iphone.languageTag(["ar_MA"]), "ar-MA");
  assert.equal(iphone.languageTag(["zh-Hant-TW"]), "zh-Hant-TW");
  assert.equal(iphone.acceptLanguage("fr-FR"), "fr-FR,fr;q=0.9");
  assert.equal(iphone.acceptLanguage("en"), "en");
});

test("a navigation's headers are Safari's, in its order", () => {
  const chromium = {
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "UA",
    "Accept-Language": "en-US",
    "sec-ch-ua": '"Chromium";v="156"',
    "sec-ch-ua-mobile": "?0",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-User": "?1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Storage-Access": "active",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    Cookie: "a=1",
  };
  const ios18 = iphone.safariHeaders(chromium, { type: "mainFrame", iphone: byName("iPhone 13"), language: "fr-FR" });
  assert.deepEqual(Object.keys(ios18), ["Sec-Fetch-Dest", "User-Agent", "Accept", "Sec-Fetch-Site", "Sec-Fetch-Mode", "Accept-Language", "Accept-Encoding", "Cookie"]);
  assert.equal(ios18.Accept, iphone.ACCEPT_DOCUMENT);
  assert.equal(ios18["Accept-Encoding"], "gzip, deflate, br");
  assert.equal(ios18["Accept-Language"], "fr-FR,fr;q=0.9");
  const ios17 = iphone.safariHeaders(chromium, { type: "mainFrame", iphone: byName("iPhone 12"), language: "en-US" });
  assert.deepEqual(Object.keys(ios17).slice(0, 7), ["Accept", "Sec-Fetch-Site", "Accept-Encoding", "Sec-Fetch-Mode", "User-Agent", "Accept-Language", "Sec-Fetch-Dest"]);
  const ios26 = iphone.safariHeaders(chromium, { type: "mainFrame", iphone: byName("iPhone 14"), language: "en-US" });
  assert.equal(ios26["Accept-Encoding"], "gzip, deflate, br, zstd");
});

test("images and style sheets ask as Safari does; what a page set itself stays", () => {
  const d = byName("iPhone 13");
  assert.equal(iphone.safariHeaders({ Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" }, { type: "image", iphone: d }).Accept, iphone.ACCEPT_IMAGE_17);
  assert.equal(iphone.safariHeaders({ Accept: "image/avif,*/*" }, { type: "image", iphone: byName("iPhone SE (2nd generation)") }).Accept, iphone.ACCEPT_IMAGE_16);
  assert.equal(iphone.safariHeaders({ Accept: "text/css,*/*;q=0.1" }, { type: "stylesheet", iphone: d }).Accept, iphone.ACCEPT_STYLE);
  assert.equal(iphone.safariHeaders({ Accept: "application/json" }, { type: "xhr", iphone: d }).Accept, "application/json");
});

test("Chromium is told the iPhone's page area, density and screen", () => {
  const d = byName("iPhone 15 Pro Max");
  const metrics = iphone.deviceMetrics(d);
  assert.deepEqual([metrics.width, metrics.height, metrics.deviceScaleFactor, metrics.mobile, metrics.screenWidth, metrics.screenHeight], [430, 739, 3, true, 430, 932]);
  assert.equal(iphone.deviceMetrics(d, 600).height, 600);
});

test("in Noor iPhone a profile is one iPhone, changed with its own seed", () => {
  const store = tempStore();
  const fingerprint = new Fingerprint(store, new Profiles(store), { iphone: true });
  assert.deepEqual(fingerprint.kinds, IPHONE_KINDS);
  for (const kind of IPHONE_KINDS) assert.equal(fingerprint.isEnabled(kind), true, kind);
  const config = fingerprint.config({ realDevice: true });
  assert.equal(config.screen, null);
  assert.equal(config.hardware, null);
  assert.ok(config.seeds.canvas !== null && config.seeds.audio !== null);
  for (let i = 0; i < 10; i++) {
    const before = fingerprint.iphone().name;
    fingerprint.newSeeds(["device"]);
    assert.notEqual(fingerprint.iphone().name, before);
  }
});

test("Noor keeps its own kinds and switches", () => {
  const store = tempStore();
  const fingerprint = new Fingerprint(store, new Profiles(store));
  assert.ok(!fingerprint.kinds.includes("device"));
  assert.equal(fingerprint.isEnabled("audio"), false);
});

const ipadNamed = (name) => iphone.IPADS.find((d) => d.name === name);

test("the iPads, each whole: upright screens at twice the pixels, held sideways, the minis alone shown websites for touch", () => {
  assert.equal(iphone.IPADS.length, 18);
  assert.equal(new Set(iphone.IPADS.map((d) => d.name)).size, iphone.IPADS.length);
  for (const d of iphone.IPADS) {
    assert.equal(d.family, "ipad");
    assert.equal(d.scale, 2, d.name);
    assert.ok(d.width >= 744 && d.width < d.height, d.name);
    assert.equal(d.pageWidth, d.height, d.name);
    assert.equal(d.fullHeight, d.width, d.name);
    assert.equal(d.pageHeight, d.width - (d.homeButton ? 20 : 24) - 50, d.name);
    assert.equal(d.desktop, !/^iPad mini/.test(d.name), d.name);
    assert.equal(d.platform, d.desktop ? "MacIntel" : "iPad", d.name);
    assert.ok([4, 8].includes(d.cores), d.name);
    assert.match(d.iOS, /^\d+\.\d+(\.\d+)?$/);
  }
  for (const d of iphone.IPHONES) {
    assert.deepEqual([d.family, d.platform, d.cores, d.desktop, d.pageWidth, d.fullHeight], ["iphone", "iPhone", 4, false, d.width, d.height], d.name);
  }
  assert.equal(ipadNamed("iPad Pro 13-inch (M4)").hdr, true);
  assert.equal(ipadNamed("iPad Air 13-inch (M2)").hdr, false);
  assert.deepEqual(iphone.FAMILIES, ["iphone", "ipad"]);
});

test("Safari's user agent on an iPad: a Mac's, but on a mini (with iPadOS 26's frozen system version)", () => {
  assert.equal(iphone.userAgent(ipadNamed("iPad Air (5th generation)")), "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15");
  assert.equal(iphone.userAgent(ipadNamed("iPad Pro 13-inch (M4)")), "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15");
  assert.equal(iphone.userAgent(ipadNamed("iPad mini (6th generation)")), "Mozilla/5.0 (iPad; CPU OS 18_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1");
});

test("Chromium is told an iPad's page sideways, a computer's (but on a mini), drawn smaller where asked", () => {
  const air = iphone.deviceMetrics(ipadNamed("iPad Air (5th generation)"));
  assert.deepEqual([air.width, air.height, air.deviceScaleFactor, air.mobile, air.scrollbarType, air.screenWidth, air.screenHeight, air.scale], [1180, 746, 2, false, "overlay", 820, 1180, 1]);
  assert.deepEqual(air.screenOrientation, { type: "landscapePrimary", angle: 90 });
  const mini = iphone.deviceMetrics(ipadNamed("iPad mini (6th generation)"), 600, 0.8);
  assert.deepEqual([mini.width, mini.height, mini.mobile, "scrollbarType" in mini, mini.scale], [1133, 600, true, false, 0.8]);
  // An iPhone's, as before.
  const phone = iphone.deviceMetrics(byName("iPhone 13"));
  assert.equal("scrollbarType" in phone, false);
  assert.deepEqual(phone.screenOrientation, { type: "portraitPrimary", angle: 0 });
});

test("a page is told the iPad's platform, cores and sideways window", () => {
  const config = iphone.pageConfig(ipadNamed("iPad Pro 11-inch (M4)"));
  assert.deepEqual([config.family, config.platform, config.cores, config.desktop, config.width, config.height, config.outerWidth, config.outerHeight], ["ipad", "MacIntel", 8, true, 834, 1210, 1210, 834]);
  assert.match(config.userAgent, /Macintosh/);
  const phone = iphone.pageConfig(byName("iPhone 13"));
  assert.deepEqual([phone.platform, phone.cores, phone.outerWidth, phone.outerHeight], ["iPhone", 4, 390, 844]);
});

test("a profile is an iPhone at first; made an iPad, its device and every new one are iPads; each profile its own", () => {
  const store = tempStore();
  const profiles = new Profiles(store);
  const fingerprint = new Fingerprint(store, profiles, { iphone: true });
  assert.equal(fingerprint.family(), "iphone");
  assert.equal(fingerprint.iphone().family, "iphone");
  fingerprint.setFamily("ipad");
  assert.equal(fingerprint.family(), "ipad");
  assert.equal(fingerprint.iphone().family, "ipad");
  for (let i = 0; i < 10; i++) {
    const before = fingerprint.iphone().name;
    fingerprint.newSeeds(["device"]);
    assert.equal(fingerprint.iphone().family, "ipad");
    assert.notEqual(fingerprint.iphone().name, before);
  }
  // The same kind again keeps the device.
  const kept = fingerprint.iphone().name;
  fingerprint.setFamily("ipad");
  assert.equal(fingerprint.iphone().name, kept);
  // Another profile stays an iPhone until made an iPad.
  const other = profiles.add("Other");
  assert.equal(fingerprint.forProfile(other).family(), "iphone");
  fingerprint.forProfile(other).setFamily("ipad");
  assert.equal(fingerprint.forProfile(other).iphone().family, "ipad");
  fingerprint.setFamily("iphone");
  assert.equal(fingerprint.iphone().family, "iphone");
  assert.equal(fingerprint.forProfile(other).family(), "ipad");
  // Anything else is an iPhone.
  fingerprint.forProfile(other).setFamily("android");
  assert.equal(fingerprint.forProfile(other).family(), "iphone");
});
