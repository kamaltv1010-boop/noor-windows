"use strict";
const iphone = require("./iphone");
const android = require("./android");

/// The builds that show a device to sites: Noor iPhone (iPhones and iPads,
/// see main/iphone.js) and Noor Android (Android phones and tablets, see
/// main/android.js); Noor itself shows this PC. What the two share: a
/// device per profile, of one of the build's kinds, shown in each tab.

/// "iphone", "android" or "windows" (Noor).
const build = () => iphone.device();

/// Each kind of device, the build it belongs to and the name it goes by.
const KINDS = {
  iphone: { build: "iphone", name: "iPhone", plural: "iPhones" },
  ipad: { build: "iphone", name: "iPad", plural: "iPads" },
  phone: { build: "android", name: "Phone", plural: "Phones" },
  tablet: { build: "android", name: "Tablet", plural: "Tablets" },
};

/// The kinds of device a build's profiles can be, the first the one a
/// profile is at first.
const familiesOf = (which = build()) => (which === "android" ? android.FAMILIES : which === "iphone" ? iphone.FAMILIES : []);

/// The devices of a kind.
const devicesOf = (family) => (KINDS[family] && KINDS[family].build === "android" ? android.DEVICES[family] : iphone.DEVICES[family]) || [];

/// The module a device's details come from.
const platformOf = (device) => (device && (device.family === "phone" || device.family === "tablet") ? android : iphone);

const userAgent = (device) => platformOf(device).userAgent(device);
const deviceMetrics = (device, pageHeight, scale) => platformOf(device).deviceMetrics(device, pageHeight, scale);
const pageConfig = (device) => platformOf(device).pageConfig(device);

/// The app's name, its Windows id and the device a build starts with.
const PRODUCTS = {
  iphone: { product: "Noor iPhone", appId: "ma.noor.iphone" },
  android: { product: "Noor Android", appId: "ma.noor.android" },
  windows: { product: "Noor", appId: "ma.noor.browser" },
};
const product = (which = build()) => PRODUCTS[which].product;
const appId = (which = build()) => PRODUCTS[which].appId;
const firstDevice = (which = build()) => devicesOf(familiesOf(which)[0])[0] || null;

/// A kind's name ("iPhone", "Tablet"…) and plural ("iPads"…).
const kindName = (family) => (KINDS[family] ? KINDS[family].name : String(family));
const kindPlural = (family) => (KINDS[family] ? KINDS[family].plural : String(family));

/// Noor Android: the Noto fonts a profile's Android has, from its fonts
/// seed (see main/android.js).
const androidFonts = (seed) => android.fontsOf(seed);

/// The version of a build's device lists (Noor Android's grew after a
/// release; Noor iPhone's lists only ever grew a kind, so it has none),
/// and the name of the device a seed picked from an older one.
const catalogVersion = (which = build()) => (which === "android" ? android.CATALOG : null);
const legacyDeviceName = (which, family, seed, version) => (which === "android" ? android.legacyDeviceName(family, seed, version) : null);

module.exports = {
  build, KINDS, familiesOf, devicesOf, platformOf, userAgent, deviceMetrics, pageConfig, product, appId, firstDevice, kindName, kindPlural, androidFonts, catalogVersion, legacyDeviceName,
};
