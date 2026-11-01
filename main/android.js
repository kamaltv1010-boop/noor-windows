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

/// The processors (systems on a chip) of the phones and tablets below, as
/// they came out with them: the maker of their graphics, their graphics as
/// the driver names them, and their cores (navigator.hardwareConcurrency:
/// a Tensor G3 has nine). A MediaTek chip's Mali tells its core count
/// ("MC2"), a Samsung's or a Google's doesn't.
const SOCS = {
  "Snapdragon 8 Elite for Galaxy": ["Qualcomm", "Adreno (TM) 830", 8],
  "Snapdragon 8 Gen 3": ["Qualcomm", "Adreno (TM) 750", 8],
  "Snapdragon 8 Gen 3 for Galaxy": ["Qualcomm", "Adreno (TM) 750", 8],
  "Snapdragon 8 Gen 2": ["Qualcomm", "Adreno (TM) 740", 8],
  "Snapdragon 8 Gen 2 for Galaxy": ["Qualcomm", "Adreno (TM) 740", 8],
  "Snapdragon 8+ Gen 1": ["Qualcomm", "Adreno (TM) 730", 8],
  "Snapdragon 8 Gen 1": ["Qualcomm", "Adreno (TM) 730", 8],
  "Snapdragon 870": ["Qualcomm", "Adreno (TM) 650", 8],
  "Snapdragon 7+ Gen 2": ["Qualcomm", "Adreno (TM) 725", 8],
  "Snapdragon 778G": ["Qualcomm", "Adreno (TM) 642L", 8],
  "Snapdragon 720G": ["Qualcomm", "Adreno (TM) 618", 8],
  "Snapdragon 695": ["Qualcomm", "Adreno (TM) 619", 8],
  "Snapdragon 685": ["Qualcomm", "Adreno (TM) 610", 8],
  "Snapdragon 680": ["Qualcomm", "Adreno (TM) 610", 8],
  "Google Tensor": ["ARM", "Mali-G78", 8],
  "Google Tensor G2": ["ARM", "Mali-G710", 8],
  "Google Tensor G3": ["ARM", "Mali-G715", 9],
  "Google Tensor G4": ["ARM", "Mali-G715", 8],
  "Exynos 1280": ["ARM", "Mali-G68", 8],
  "Exynos 1330": ["ARM", "Mali-G68", 8],
  "Exynos 1380": ["ARM", "Mali-G68", 8],
  "Dimensity 1080": ["ARM", "Mali-G68 MC4", 8],
  "Dimensity 6100+": ["ARM", "Mali-G57 MC2", 8],
  "Dimensity 6080": ["ARM", "Mali-G57 MC2", 8],
  "Helio G99": ["ARM", "Mali-G57 MC2", 8],
  "Helio G99-Ultra": ["ARM", "Mali-G57 MC2", 8],
  "Helio G88": ["ARM", "Mali-G52 MC2", 8],
  "Helio G85": ["ARM", "Mali-G52 MC2", 8],
  "Helio G80": ["ARM", "Mali-G52 MC2", 8],
};

/// A device from its row: its processor's graphics and cores, its page
/// area (what Chrome's bars leave it), its window, and the platform Chrome
/// tells (64-bit Chrome from 8 GB, the 32-bit one below).
const deviceOf = (family, bars) => ([name, model, width, height, scale, android, soc, memory, touchPoints, hdr, p3, navigation]) => {
  const [gpuVendor, gpu, cores] = SOCS[soc];
  return {
    family, name, model, width, height, scale, android, soc, gpuVendor, gpu, cores, memory, touchPoints, hdr, p3,
    pageWidth: width,
    pageHeight: height - bars - (navigation === "buttons" ? NAV_BUTTONS : NAV_GESTURES),
    fullHeight: height,
    // Chrome's window: the screen less the status bar (its toolbar in it).
    outerHeight: height - STATUS_BAR,
    platform: memory >= 8 ? "Linux aarch64" : "Linux armv8l",
    os: android,
  };
};

/// Real Android phones, upright, each with an Android version it runs:
/// its model (as Chrome tells it), its screen in dp and pixel density, its
/// processor, the memory Chrome reports (a power of two, 8 at most), its
/// touch points, whether its screen shows HDR and wide colors, and how it
/// navigates.
const PHONES = [
  ["Samsung Galaxy S25", "SM-S931B", 360, 780, 3, "15", "Snapdragon 8 Elite for Galaxy", 8, 10, true, true, "buttons"],
  ["Samsung Galaxy S24 Ultra", "SM-S928B", 384, 832, 2.8125, "14", "Snapdragon 8 Gen 3 for Galaxy", 8, 10, true, true, "buttons"],
  ["Samsung Galaxy S24", "SM-S921U", 360, 780, 3, "14", "Snapdragon 8 Gen 3 for Galaxy", 8, 10, true, true, "buttons"],
  ["Samsung Galaxy S23", "SM-S911B", 360, 780, 3, "14", "Snapdragon 8 Gen 2 for Galaxy", 8, 10, true, true, "buttons"],
  ["Samsung Galaxy S23 Ultra", "SM-S918B", 384, 824, 2.8125, "14", "Snapdragon 8 Gen 2 for Galaxy", 8, 10, true, true, "buttons"],
  ["Samsung Galaxy S22", "SM-S901U", 360, 780, 3, "14", "Snapdragon 8 Gen 1", 8, 10, true, true, "buttons"],
  ["Samsung Galaxy A54 5G", "SM-A546B", 412, 892, 2.625, "14", "Exynos 1380", 8, 10, false, true, "buttons"],
  ["Samsung Galaxy A35 5G", "SM-A356B", 412, 892, 2.625, "14", "Exynos 1380", 4, 10, false, true, "buttons"],
  ["Samsung Galaxy A34 5G", "SM-A346B", 412, 892, 2.625, "14", "Dimensity 1080", 4, 10, false, true, "buttons"],
  ["Samsung Galaxy A53 5G", "SM-A536B", 412, 915, 2.625, "14", "Exynos 1280", 4, 10, false, true, "buttons"],
  ["Samsung Galaxy A52", "SM-A525F", 412, 914, 2.625, "14", "Snapdragon 720G", 4, 10, false, true, "buttons"],
  ["Samsung Galaxy A25 5G", "SM-A256B", 412, 892, 2.625, "14", "Exynos 1280", 4, 10, false, true, "buttons"],
  ["Samsung Galaxy A24", "SM-A245F", 412, 892, 2.625, "14", "Helio G99", 4, 10, false, true, "buttons"],
  ["Samsung Galaxy A16 5G", "SM-A166B", 412, 892, 2.625, "14", "Exynos 1330", 4, 10, false, true, "buttons"],
  ["Samsung Galaxy A15 5G", "SM-A156B", 412, 892, 2.625, "14", "Dimensity 6100+", 4, 10, false, true, "buttons"],
  ["Samsung Galaxy A15", "SM-A155F", 412, 892, 2.625, "14", "Helio G99", 4, 10, false, true, "buttons"],
  ["Samsung Galaxy A14", "SM-A145P", 412, 918, 2.625, "14", "Helio G80", 4, 10, false, false, "buttons"],
  ["Samsung Galaxy A05s", "SM-A057F", 412, 915, 2.625, "14", "Snapdragon 680", 4, 10, false, false, "buttons"],
  ["Google Pixel 9", "Pixel 9", 360, 808, 3, "15", "Google Tensor G4", 8, 5, true, true, "gestures"],
  ["Google Pixel 8 Pro", "Pixel 8 Pro", 448, 998, 3, "15", "Google Tensor G3", 8, 5, true, true, "gestures"],
  ["Google Pixel 8", "Pixel 8", 412, 915, 2.625, "15", "Google Tensor G3", 8, 5, true, true, "gestures"],
  ["Google Pixel 8a", "Pixel 8a", 412, 915, 2.625, "15", "Google Tensor G3", 8, 5, true, true, "gestures"],
  ["Google Pixel 7 Pro", "Pixel 7 Pro", 412, 892, 3.5, "14", "Google Tensor G2", 8, 5, true, true, "gestures"],
  ["Google Pixel 7", "Pixel 7", 412, 915, 2.625, "14", "Google Tensor G2", 8, 5, true, true, "gestures"],
  ["Google Pixel 7a", "Pixel 7a", 412, 915, 2.625, "14", "Google Tensor G2", 8, 5, true, true, "gestures"],
  ["Google Pixel 6", "Pixel 6", 412, 915, 2.625, "14", "Google Tensor", 8, 5, true, true, "gestures"],
  ["Google Pixel 6a", "Pixel 6a", 412, 915, 2.625, "14", "Google Tensor", 4, 5, true, true, "gestures"],
  ["Xiaomi Redmi Note 13 Pro", "23117RA68G", 393, 873, 2.75, "14", "Helio G99-Ultra", 8, 10, false, true, "gestures"],
  ["Xiaomi Redmi Note 13 5G", "2312DRAABG", 393, 873, 2.75, "14", "Dimensity 6080", 4, 10, false, true, "gestures"],
  ["Xiaomi Redmi Note 13", "23129RAA4G", 393, 873, 2.75, "14", "Snapdragon 685", 4, 10, false, true, "gestures"],
  ["Xiaomi Redmi Note 12 Pro 5G", "22101316G", 393, 873, 2.75, "14", "Dimensity 1080", 8, 10, true, true, "gestures"],
  ["Xiaomi Redmi Note 12", "23021RAAEG", 393, 873, 2.75, "14", "Snapdragon 685", 4, 10, false, true, "gestures"],
  ["Xiaomi Redmi 13C", "23106RN0DA", 360, 800, 2, "14", "Helio G85", 4, 10, false, false, "gestures"],
  ["Xiaomi Redmi 12", "23053RN02A", 393, 895, 2.75, "14", "Helio G88", 4, 10, false, false, "gestures"],
  ["Xiaomi POCO F5", "23049PCD8G", 393, 873, 2.75, "14", "Snapdragon 7+ Gen 2", 8, 10, true, true, "gestures"],
  ["Xiaomi POCO X5 Pro 5G", "22101320G", 393, 873, 2.75, "14", "Snapdragon 778G", 8, 10, true, true, "gestures"],
  ["OnePlus 12", "CPH2581", 412, 906, 3.5, "14", "Snapdragon 8 Gen 3", 8, 10, true, true, "gestures"],
  ["OnePlus 11", "CPH2449", 412, 919, 3.5, "14", "Snapdragon 8 Gen 2", 8, 10, true, true, "gestures"],
  ["OnePlus Nord CE 3 Lite 5G", "CPH2465", 412, 915, 2.625, "14", "Snapdragon 695", 8, 10, false, false, "gestures"],
  ["Nothing Phone (2)", "A065", 412, 919, 2.625, "14", "Snapdragon 8+ Gen 1", 8, 10, true, true, "gestures"],
].map(deviceOf("phone", STATUS_BAR + TOOLBAR));

/// Real Android tablets, held sideways (their natural way, so the screen
/// reports itself sideways at 0°): the same details as a phone's, Chrome's
/// tab strip above its toolbar.
const TABLETS = [
  ["Samsung Galaxy Tab S9", "SM-X710", 1280, 800, 2, "14", "Snapdragon 8 Gen 2 for Galaxy", 8, 10, true, true, "buttons"],
  ["Samsung Galaxy Tab S8", "SM-X700", 1280, 800, 2, "14", "Snapdragon 8 Gen 1", 8, 10, false, false, "buttons"],
  ["Samsung Galaxy Tab A9+", "SM-X210", 1280, 800, 1.5, "14", "Snapdragon 695", 4, 10, false, false, "buttons"],
  ["Samsung Galaxy Tab S6 Lite", "SM-P613", 1333, 800, 1.5, "14", "Snapdragon 720G", 4, 10, false, false, "buttons"],
  ["Google Pixel Tablet", "Pixel Tablet", 1280, 800, 2, "15", "Google Tensor G2", 8, 10, false, false, "gestures"],
  ["Lenovo Tab P11 (2nd Gen)", "TB350FU", 1333, 800, 1.5, "13", "Helio G99", 4, 10, false, false, "buttons"],
  ["Xiaomi Pad 6", "23043RP34G", 1440, 900, 2, "14", "Snapdragon 870", 8, 10, false, true, "gestures"],
  ["Xiaomi Redmi Pad SE", "23073RPBFG", 1280, 800, 1.5, "14", "Snapdragon 680", 4, 10, false, false, "gestures"],
].map(deviceOf("tablet", STATUS_BAR + TAB_STRIP + TOOLBAR));

/// The device lists as they were before (a profile's device seed picks
/// from the list of its time), so a profile made then stays the same
/// device: 1, Noor Android 1.0.37's. A device since taken out is followed
/// by the one in its place.
const CATALOG = 2;
const LEGACY = {
  1: {
    phone: ["Samsung Galaxy S24", "Samsung Galaxy S23", "Samsung Galaxy S23 Ultra", "Samsung Galaxy S22", "Samsung Galaxy A53 5G", "Samsung Galaxy A52", "Google Pixel 6a", "Google Pixel 7", "Google Pixel 7a", "Google Pixel 8", "Google Pixel 8 Pro", "Google Pixel 9", "Xiaomi Redmi Note 12", "Xiaomi Redmi Note 13", "OnePlus 11"],
    tablet: ["Samsung Galaxy Tab S9", "Samsung Galaxy Tab S8", "Samsung Galaxy Tab A8", "Samsung Galaxy Tab S6 Lite", "Google Pixel Tablet", "Lenovo Tab P11 (2nd Gen)", "Xiaomi Pad 6", "Xiaomi Redmi Pad SE"],
  },
};
const REPLACED = { "Samsung Galaxy Tab A8": "Samsung Galaxy Tab A9+" };

/// The device a seed picked from the lists of `version`, by its name today.
const legacyDeviceName = (family, seed, version) => {
  const list = LEGACY[version] && LEGACY[version][family];
  if (!list) return null;
  const name = list[(Number(seed) >>> 0) % list.length];
  return REPLACED[name] || name;
};

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

/// The graphics card of the device's processor as Chrome on it tells it.
/// In WebGL, through ANGLE, which Chrome on Android draws with (as on a
/// PC): "Google Inc. (Qualcomm)" and "ANGLE (Qualcomm, Adreno (TM) 740,
/// OpenGL ES 3.2)". In WebGPU, its maker and family as Chrome names them
/// (`qualcomm` and `adreno-7xx`, `arm` and `valhall`), and how wide its
/// subgroups run.
const graphicsOf = (device) => {
  const adreno = device.gpuVendor === "Qualcomm";
  const bifrost = /^Mali-G(31|51|52|71|72|76)\b/.test(device.gpu);
  return {
    family: adreno ? "adreno" : "mali",
    vendor: `Google Inc. (${device.gpuVendor})`,
    renderer: `ANGLE (${device.gpuVendor}, ${device.gpu}, OpenGL ES 3.2)`,
    webgpu: {
      vendor: adreno ? "qualcomm" : "arm",
      architecture: adreno ? `adreno-${(device.gpu.match(/\d/) || ["6"])[0]}xx` : bifrost ? "bifrost" : "valhall",
      subgroupMinSize: adreno ? 64 : bifrost ? 8 : 16,
      subgroupMaxSize: adreno ? 128 : bifrost ? 8 : 16,
    },
  };
};

/// What a page script of Noor Android is told (see scripts/parts/android.js):
/// the device, and its graphics card unless `graphics` is false (the
/// profile's WebGL Vendor & Renderer switch off: sites see this PC's own).
const pageConfig = (device, { graphics = true } = {}) => ({
  family: device.family,
  model: device.model,
  platform: device.platform,
  android: device.android,
  graphics: graphics ? graphicsOf(device) : null,
  hdr: device.hdr,
  width: device.width,
  height: device.height,
  outerWidth: device.pageWidth,
  outerHeight: device.outerHeight,
});

/// Android's Noto fonts for other writing systems, each with a font of
/// Windows that draws its letters much like it (see scripts/parts/android.js).
/// Every Android has the base ones (scripts/parts/android-fonts.js); which
/// of these it has differs from one Android to another (its version, its
/// maker), and so, with Fonts on, from one profile to another.
const NOTO_FONTS = [
  ["Noto Naskh Arabic", "Segoe UI"], ["Noto Naskh Arabic UI", "Segoe UI"], ["Noto Sans Hebrew", "Segoe UI"],
  ["Noto Sans Armenian", "Segoe UI"], ["Noto Serif Armenian", "Sylfaen"], ["Noto Sans Georgian", "Segoe UI"],
  ["Noto Serif Georgian", "Sylfaen"], ["Noto Sans Ethiopic", "Ebrima"], ["Noto Sans Tifinagh", "Ebrima"],
  ["Noto Sans Thai", "Leelawadee UI"], ["Noto Sans Thai UI", "Leelawadee UI"], ["Noto Serif Thai", "Leelawadee UI"],
  ["Noto Sans Lao", "Leelawadee UI"], ["Noto Sans Khmer", "Leelawadee UI"], ["Noto Sans Myanmar", "Myanmar Text"],
  ["Noto Sans Devanagari", "Nirmala UI"], ["Noto Sans Devanagari UI", "Nirmala UI"], ["Noto Serif Devanagari", "Nirmala UI"],
  ["Noto Sans Bengali", "Nirmala UI"], ["Noto Sans Gujarati", "Nirmala UI"], ["Noto Sans Gurmukhi", "Nirmala UI"],
  ["Noto Sans Tamil", "Nirmala UI"], ["Noto Sans Telugu", "Nirmala UI"], ["Noto Sans Kannada", "Nirmala UI"],
  ["Noto Sans Malayalam", "Nirmala UI"], ["Noto Sans Oriya", "Nirmala UI"], ["Noto Sans Sinhala", "Nirmala UI"],
  ["Noto Sans Cherokee", "Gadugi"], ["Noto Sans Thaana", "MV Boli"], ["Noto Sans Symbols", "Segoe UI Symbol"],
  ["Noto Sans Symbols 2", "Segoe UI Symbol"], ["Noto Sans Math", "Cambria Math"], ["Noto Sans CJK JP", "Yu Gothic"],
  ["Noto Sans CJK KR", "Malgun Gothic"], ["Noto Sans CJK SC", "Microsoft YaHei"], ["Noto Sans CJK TC", "Microsoft JhengHei"],
  ["Noto Serif CJK JP", "Yu Mincho"], ["Noto Sans Mongolian", "Mongolian Baiti"], ["Noto Sans Javanese", "Javanese Text"],
  ["Noto Sans Yi", "Microsoft Yi Baiti"],
];

/// The Noto fonts a profile's Android has, from its fonts seed: about two
/// in three of them, at least a dozen, a different pick for every seed
/// (`add`, with the font of Windows that draws each), the others missing
/// (`block`). With no seed (Fonts off), every one, as on a plain Android.
const fontsOf = (seed) => {
  if (seed === null || seed === undefined) return { add: NOTO_FONTS.map((font) => font.slice()), block: [] };
  let state = (Number(seed) >>> 0) || 1;
  const next = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state;
  };
  const add = [];
  const block = [];
  for (const font of NOTO_FONTS) (next() % 3 !== 0 ? add : block).push(font);
  while (add.length < 12) add.push(block.shift());
  return { add: add.map((font) => font.slice()), block: block.map((font) => font[0]) };
};

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
  SOCS, PHONES, TABLETS, DEVICES, FAMILIES, NOTO_FONTS, CATALOG, legacyDeviceName, chromeMajor, userAgent, userAgentMetadata, deviceMetrics, graphicsOf, pageConfig, fontsOf, hintHeaders, batteryOf,
};
