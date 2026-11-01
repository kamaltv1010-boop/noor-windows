"use strict";

/// Noor Android: the same browser, built as an app of its own (see
/// tools/build-android.js), in which every profile is one real Android
/// phone or tablet to the sites it opens: Chrome on Android, the version
/// this app's Chromium is, with the device's screen, pixel density and
/// touch, its model and Android version in Chrome's client hints, its
/// graphics card, memory, fonts and voices, and what Chrome on Android has
/// and lacks (see scripts/parts/android.js). Chrome on Android is Chromium
/// too: the engine, its connections and its headers are those a site
/// expects of it.

/// Chrome's major version: this app's Chromium's.
const chromeMajor = () => (process.versions.chrome || "0").split(".")[0];

/// What Chrome's bars leave a page, in dp: the status bar, Chrome's
/// toolbar (on a tablet with its tab strip above), and the navigation bar
/// (gestures, or three buttons as a Samsung shows them at first).
const STATUS_BAR = 24;
const TOOLBAR = 56;
const TAB_STRIP = 40;
const NAV_GESTURES = 24;
const NAV_BUTTONS = 48;

/// Real Android phones, upright, each with an Android version it runs:
/// its model (as Chrome tells it), its screen in dp and pixel density,
/// its graphics card as WebGL tells it, the memory Chrome reports (a power
/// of two, 8 at most), its touch points, whether its screen shows HDR and
/// wide colors, and how it navigates.
const PHONES = [
  ["Samsung Galaxy S24", "SM-S921U", 360, 780, 3, "14", "Qualcomm", "Adreno (TM) 750", 8, 10, true, true, "buttons"],
  ["Samsung Galaxy S23", "SM-S911B", 360, 780, 3, "14", "Qualcomm", "Adreno (TM) 740", 8, 10, true, true, "buttons"],
  ["Samsung Galaxy S23 Ultra", "SM-S918B", 384, 824, 2.8125, "14", "Qualcomm", "Adreno (TM) 740", 8, 10, true, true, "buttons"],
  ["Samsung Galaxy S22", "SM-S901U", 360, 780, 3, "14", "Qualcomm", "Adreno (TM) 730", 8, 10, true, true, "buttons"],
  ["Samsung Galaxy A53 5G", "SM-A536B", 412, 915, 2.625, "14", "ARM", "Mali-G68", 4, 10, false, true, "buttons"],
  ["Samsung Galaxy A52", "SM-A525F", 412, 914, 2.625, "14", "Qualcomm", "Adreno (TM) 618", 4, 10, false, true, "buttons"],
  ["Google Pixel 6a", "Pixel 6a", 412, 915, 2.625, "14", "ARM", "Mali-G78", 4, 5, true, true, "gestures"],
  ["Google Pixel 7", "Pixel 7", 412, 915, 2.625, "14", "ARM", "Mali-G710", 8, 5, true, true, "gestures"],
  ["Google Pixel 7a", "Pixel 7a", 412, 915, 2.625, "14", "ARM", "Mali-G710", 8, 5, true, true, "gestures"],
  ["Google Pixel 8", "Pixel 8", 412, 915, 2.625, "15", "ARM", "Mali-G715", 8, 5, true, true, "gestures"],
  ["Google Pixel 8 Pro", "Pixel 8 Pro", 448, 998, 3, "15", "ARM", "Mali-G715", 8, 5, true, true, "gestures"],
  ["Google Pixel 9", "Pixel 9", 412, 923, 2.625, "15", "ARM", "Mali-G715", 8, 5, true, true, "gestures"],
  ["Xiaomi Redmi Note 12", "23021RAAEG", 393, 873, 2.75, "14", "Qualcomm", "Adreno (TM) 610", 4, 10, false, true, "gestures"],
  ["Xiaomi Redmi Note 13", "23129RAA4G", 393, 873, 2.75, "14", "Qualcomm", "Adreno (TM) 610", 4, 10, false, true, "gestures"],
  ["OnePlus 11", "CPH2449", 412, 919, 3.5, "14", "Qualcomm", "Adreno (TM) 740", 8, 10, true, true, "gestures"],
].map(([name, model, width, height, scale, android, gpuVendor, gpu, memory, touchPoints, hdr, p3, navigation]) => {
  const pageHeight = height - STATUS_BAR - TOOLBAR - (navigation === "buttons" ? NAV_BUTTONS : NAV_GESTURES);
  return {
    family: "phone", name, model, width, height, scale, android, gpuVendor, gpu, memory, touchPoints, hdr, p3,
    pageWidth: width, pageHeight, fullHeight: height,
    // Chrome's window: the screen less the status bar (its toolbar in it).
    outerHeight: height - STATUS_BAR,
    // 64-bit Chrome from 8 GB, the 32-bit one below (see navigator.platform).
    platform: memory >= 8 ? "Linux aarch64" : "Linux armv8l",
    cores: 8,
    os: android,
  };
});

/// Real Android tablets, held sideways (their natural way, so the screen
/// reports itself sideways at 0°): the same details as a phone's, Chrome's
/// tab strip above its toolbar.
const TABLETS = [
  ["Samsung Galaxy Tab S9", "SM-X710", 1280, 800, 2, "14", "Qualcomm", "Adreno (TM) 740", 8, 10, true, true, "buttons"],
  ["Samsung Galaxy Tab S8", "SM-X700", 1280, 800, 2, "14", "Qualcomm", "Adreno (TM) 730", 8, 10, false, false, "buttons"],
  ["Samsung Galaxy Tab A8", "SM-X200", 1280, 800, 1.5, "14", "ARM", "Mali-G52", 4, 10, false, false, "buttons"],
  ["Samsung Galaxy Tab S6 Lite", "SM-P613", 1333, 800, 1.5, "14", "Qualcomm", "Adreno (TM) 618", 4, 10, false, false, "buttons"],
  ["Google Pixel Tablet", "Pixel Tablet", 1280, 800, 2, "15", "ARM", "Mali-G710", 8, 10, false, false, "gestures"],
  ["Lenovo Tab P11 (2nd Gen)", "TB350FU", 1333, 800, 1.5, "13", "ARM", "Mali-G57", 4, 10, false, false, "buttons"],
  ["Xiaomi Pad 6", "23043RP34G", 1440, 900, 2, "14", "Qualcomm", "Adreno (TM) 650", 8, 10, false, true, "gestures"],
  ["Xiaomi Redmi Pad SE", "23073RPBFG", 1280, 800, 1.5, "14", "Qualcomm", "Adreno (TM) 610", 4, 10, false, false, "gestures"],
].map(([name, model, width, height, scale, android, gpuVendor, gpu, memory, touchPoints, hdr, p3, navigation]) => {
  const pageHeight = height - STATUS_BAR - TAB_STRIP - TOOLBAR - (navigation === "buttons" ? NAV_BUTTONS : NAV_GESTURES);
  return {
    family: "tablet", name, model, width, height, scale, android, gpuVendor, gpu, memory, touchPoints, hdr, p3,
    pageWidth: width, pageHeight, fullHeight: height,
    outerHeight: height - STATUS_BAR,
    platform: memory >= 8 ? "Linux aarch64" : "Linux armv8l",
    cores: 8,
    os: android,
  };
});

/// The devices a profile can be, by kind: "phone" or "tablet".
const DEVICES = { phone: PHONES, tablet: TABLETS };
const FAMILIES = Object.keys(DEVICES);

/// Chrome's reduced user agent on Android: a fixed "Android 10; K" for
/// every device, "Mobile" on a phone and not on a tablet.
const userAgent = (device) => `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor()}.0.0.0 ${device.family === "tablet" ? "" : "Mobile "}Safari/537.36`;

/// What Chrome on the device tells beside the user agent (its client
/// hints, navigator.userAgentData), as the debugging protocol's override
/// takes it: Chrome's brands, Android and its version, the model, a phone
/// or not, no architecture or bitness (Chrome tells neither on Android).
const userAgentMetadata = (device, { brandList, fullVersionList }) => ({
  brands: brandList.map((b) => ({ brand: b.brand, version: b.version })),
  fullVersionList: fullVersionList.map((b) => ({ brand: b.brand, version: b.version })),
  platform: "Android",
  platformVersion: `${device.android}.0.0`,
  architecture: "",
  model: device.model,
  mobile: device.family === "phone",
  bitness: "",
  wow64: false,
  formFactors: [device.family === "tablet" ? "Tablet" : "Mobile"],
});

/// What Chromium is told to show a tab's page (the debugging protocol's
/// Emulation.setDeviceMetricsOverride): the device's page area at its pixel
/// density, as a phone's (the page's viewport tag counts, scroll bars float
/// over it), and its screen as Android reports it (held as it is: a phone
/// upright, a tablet sideways, at 0°). `pageHeight` and `scale` as for an
/// iPhone (see main/iphone.js).
const deviceMetrics = (device, pageHeight = device.pageHeight, scale = 1) => ({
  width: device.pageWidth,
  height: pageHeight,
  deviceScaleFactor: device.scale,
  mobile: true,
  scale,
  screenWidth: device.width,
  screenHeight: device.height,
  positionX: 0,
  positionY: 0,
  screenOrientation: device.family === "tablet" ? { type: "landscapePrimary", angle: 0 } : { type: "portraitPrimary", angle: 0 },
});

/// What a page script of Noor Android is told (see scripts/parts/android.js).
const pageConfig = (device) => ({
  family: device.family,
  model: device.model,
  platform: device.platform,
  android: device.android,
  gpuVendor: device.gpuVendor,
  gpu: device.gpu,
  hdr: device.hdr,
  width: device.width,
  height: device.height,
  outerWidth: device.pageWidth,
  outerHeight: device.outerHeight,
});

/// A phone's battery, the profile's own (from its device's seed): between
/// a third and nearly full, on its charger one time in five.
const batteryOf = (seed) => {
  const n = Number(seed) >>> 0;
  return { level: (35 + ((n >>> 3) % 61)) / 100, charging: n % 5 === 0 };
};

/// The client hints a request carries as Chrome on the device sends them,
/// where Chromium sent its own (a request no tab's override covers, a
/// service worker's): Android, the device's model and version, a phone or
/// not. The others stay as they came.
const hintHeaders = (headers, device) => {
  const out = {};
  for (const name of Object.keys(headers)) {
    const lower = name.toLowerCase();
    let value = headers[name];
    if (lower === "sec-ch-ua-platform") value = '"Android"';
    else if (lower === "sec-ch-ua-mobile") value = device.family === "phone" ? "?1" : "?0";
    else if (lower === "sec-ch-ua-model") value = `"${device.model}"`;
    else if (lower === "sec-ch-ua-platform-version") value = `"${device.android}.0.0"`;
    else if (lower === "sec-ch-ua-arch" || lower === "sec-ch-ua-bitness") value = '""';
    else if (lower === "sec-ch-ua-wow64") value = "?0";
    else if (lower === "sec-ch-ua-form-factors") value = device.family === "tablet" ? '"Tablet"' : '"Mobile"';
    out[name] = value;
  }
  return out;
};

module.exports = {
  PHONES, TABLETS, DEVICES, FAMILIES, chromeMajor, userAgent, userAgentMetadata, deviceMetrics, pageConfig, hintHeaders, batteryOf,
};
