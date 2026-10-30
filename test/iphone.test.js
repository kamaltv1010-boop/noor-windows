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
