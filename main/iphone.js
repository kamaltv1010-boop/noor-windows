"use strict";

/// Noor iPhone: the same browser, built as an app of its own (see
/// tools/build-iphone.js), in which every profile is one real iPhone to the
/// sites it opens, as in the iPhone app: Safari's user agent and requests,
/// the iPhone's screen, pixel density and touch, and what Safari on that
/// iPhone has and lacks (see scripts/parts/iphone.js).

/// The device this build shows: "iphone" in Noor iPhone, "android" in Noor
/// Android (written into its package.json by tools/build-iphone.js or
/// tools/build-android.js; from the source, `npm run start:iphone` or
/// `start:android`, or NOOR_DEVICE), "windows" otherwise (see main/mobile.js).
const BUILDS = ["iphone", "android"];
const device = () => {
  if (process.env.NOOR_DEVICE) {
    return BUILDS.includes(process.env.NOOR_DEVICE) ? process.env.NOOR_DEVICE : "windows";
  }
  if (process.argv.includes("--noor-iphone")) {
    return "iphone";
  }
  if (process.argv.includes("--noor-android")) {
    return "android";
  }
  try {
    const written = require("../package.json").noorDevice;
    return BUILDS.includes(written) ? written : "windows";
  } catch (error) {
    return "windows";
  }
};

const isIPhone = () => device() === "iphone";

/// Real iPhones, the iPhone app's list (AmirBrowser/FingerprintProtection.swift),
/// each with an iOS version it runs: its screen in points, its pixel
/// density, whether its screen shows HDR, and the page area Safari leaves a
/// page there (its toolbar at the bottom, the status bar at the top). Safari
/// on iOS 26 reports a frozen "18_6" in "iPhone OS" (18_7 from 26.2), the
/// real version only in "Version/".
const IPHONES = [
  ["iPhone SE (2nd generation)", 375, 667, 2, false, 548, "16.6.1", "16_6_1", "16.6"],
  ["iPhone 11 Pro", 375, 812, 3, true, 635, "16.7.10", "16_7_10", "16.6"],
  ["iPhone XS", 375, 812, 3, true, 635, "17.0.3", "17_0_3", "17.0"],
  ["iPhone XR", 414, 896, 2, false, 715, "17.1.2", "17_1_2", "17.1"],
  ["iPhone 11 Pro Max", 414, 896, 3, true, 715, "17.2.1", "17_2_1", "17.2"],
  ["iPhone 12 mini", 375, 812, 3, true, 635, "17.3.1", "17_3_1", "17.3"],
  ["iPhone 12", 390, 844, 3, true, 664, "17.4.1", "17_4_1", "17.4"],
  ["iPhone SE (3rd generation)", 375, 667, 2, false, 548, "17.5.1", "17_5_1", "17.5"],
  ["iPhone 15", 393, 852, 3, true, 659, "17.6.1", "17_6_1", "17.6"],
  ["iPhone 11", 414, 896, 2, false, 715, "18.0.1", "18_0_1", "18.0"],
  ["iPhone 12 Pro Max", 428, 926, 3, true, 746, "18.1.1", "18_1_1", "18.1"],
  ["iPhone 13", 390, 844, 3, true, 664, "18.2.1", "18_2_1", "18.2"],
  ["iPhone 13 Pro Max", 428, 926, 3, true, 746, "18.3.2", "18_3_2", "18.3"],
  ["iPhone 14 Plus", 428, 926, 3, true, 746, "18.4.1", "18_4_1", "18.4"],
  ["iPhone 14 Pro", 393, 852, 3, true, 659, "18.5", "18_5", "18.5"],
  ["iPhone 16", 393, 852, 3, true, 659, "18.6", "18_6", "18.6"],
  ["iPhone 15 Pro Max", 430, 932, 3, true, 739, "18.6.2", "18_6_2", "18.6"],
  ["iPhone 14", 390, 844, 3, true, 664, "26.0", "18_6", "26.0"],
  ["iPhone 14 Pro Max", 430, 932, 3, true, 739, "26.1", "18_6", "26.1"],
  ["iPhone 16 Pro Max", 440, 956, 3, true, 763, "26.2", "18_7", "26.2"],
].map(([name, width, height, scale, hdr, pageHeight, iOS, uaOS, safari]) => ({
  family: "iphone", name, width, height, scale, hdr, pageWidth: width, pageHeight, fullHeight: height, iOS, uaOS, safari,
  platform: "iPhone", cores: 4, desktop: false,
}));

/// What Safari leaves a page of an iPad's screen, in points: the status
/// bar (20 points on an iPad with a home button, 24 on the others) and
/// Safari's toolbar.
const IPAD_TOOLBAR = 50;

/// Real iPads, each with an iPadOS version it runs: its screen in points,
/// upright (as Safari reports it whichever way the iPad is held), whether
/// it shows HDR (the XDR and OLED screens), the core count WebKit reports
/// (8 from 8 cores, 4 below; see WebKit's NavigatorBase.cpp), and whether
/// it has a home button. Every one is held sideways, as an iPad on a desk
/// is, which fits a PC's screen. Safari shows every iPad but the minis the
/// websites a Mac gets ("desktop-class browsing", see WebKit's
/// WebPageProxyIOS.mm): a Mac's user agent, "MacIntel" for the platform,
/// and the page as wide as the window, whatever its viewport tag says.
const IPADS = [
  ["iPad (9th generation)", 810, 1080, false, 4, true, "17.0.3", "17_0_3", "17.0"],
  ["iPad Air (4th generation)", 820, 1180, false, 4, false, "17.1.2", "17_1_2", "17.1"],
  ["iPad mini (5th generation)", 768, 1024, false, 4, true, "17.2.1", "17_2_1", "17.2"],
  ["iPad Pro 12.9-inch (5th generation)", 1024, 1366, true, 8, false, "17.3.1", "17_3_1", "17.3"],
  ["iPad (10th generation)", 820, 1180, false, 4, false, "17.4.1", "17_4_1", "17.4"],
  ["iPad Air 11-inch (M2)", 820, 1180, false, 8, false, "17.5.1", "17_5_1", "17.5"],
  ["iPad Pro 11-inch (2nd generation)", 834, 1194, false, 8, false, "17.6.1", "17_6_1", "17.6"],
  ["iPad mini (6th generation)", 744, 1133, false, 4, false, "18.0.1", "18_0_1", "18.0"],
  ["iPad Pro 11-inch (M4)", 834, 1210, true, 8, false, "18.1.1", "18_1_1", "18.1"],
  ["iPad Air (5th generation)", 820, 1180, false, 8, false, "18.2.1", "18_2_1", "18.2"],
  ["iPad mini (A17 Pro)", 744, 1133, false, 4, false, "18.3.2", "18_3_2", "18.3"],
  ["iPad Pro 12.9-inch (6th generation)", 1024, 1366, true, 8, false, "18.4.1", "18_4_1", "18.4"],
  ["iPad (A16)", 820, 1180, false, 4, false, "18.5", "18_5", "18.5"],
  ["iPad Air 13-inch (M2)", 1024, 1366, false, 8, false, "18.6", "18_6", "18.6"],
  ["iPad Air 11-inch (M3)", 820, 1180, false, 8, false, "18.6.2", "18_6_2", "18.6"],
  ["iPad Pro 13-inch (M4)", 1032, 1376, true, 8, false, "26.0", "18_6", "26.0"],
  ["iPad Pro 11-inch (4th generation)", 834, 1194, false, 8, false, "26.1", "18_6", "26.1"],
  ["iPad Air 13-inch (M3)", 1024, 1366, false, 8, false, "26.2", "18_7", "26.2"],
].map(([name, width, height, hdr, cores, homeButton, iOS, uaOS, safari]) => {
  const desktop = !/^iPad mini/.test(name);
  return {
    family: "ipad", name, width, height, scale: 2, hdr, cores, homeButton,
    // Sideways: the page as wide as the screen is long, under the bars.
    pageWidth: height, pageHeight: width - (homeButton ? 20 : 24) - IPAD_TOOLBAR, fullHeight: width,
    iOS, uaOS, safari, desktop, platform: desktop ? "MacIntel" : "iPad",
  };
});

/// The devices a profile can be, by kind: "iphone" or "ipad".
const DEVICES = { iphone: IPHONES, ipad: IPADS };
const FAMILIES = Object.keys(DEVICES);

/// Safari's user agent on `device`: an iPhone's, a Mac's on an iPad that
/// gets desktop websites, an iPad's on a mini (see WebKit's
/// UserAgentIOS.mm).
const userAgent = (device) => {
  if (device.family === "ipad") {
    return device.desktop
      ? `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${device.safari} Safari/605.1.15`
      : `Mozilla/5.0 (iPad; CPU OS ${device.uaOS} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${device.safari} Mobile/15E148 Safari/604.1`;
  }
  return `Mozilla/5.0 (iPhone; CPU iPhone OS ${device.uaOS} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${device.safari} Mobile/15E148 Safari/604.1`;
};

/// Compares iOS versions: below 0 when `a` is older than `b`.
const compareVersions = (a, b) => {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
};

const atLeast = (iphone, version) => compareVersions(iphone.iOS, version) >= 0;

/// The language Safari tells sites of: the system's first, with its region
/// ("fr-FR"), as a single one in navigator.languages; Safari's
/// Accept-Language adds the language alone ("fr-FR,fr;q=0.9").
const languageTag = (preferred) => {
  const tag = String((preferred && preferred[0]) || "en-US").replace(/_/g, "-");
  const [language, ...rest] = tag.split("-");
  const region = rest.find((part) => /^[A-Za-z]{2}$|^\d{3}$/.test(part));
  const script = rest.find((part) => /^[A-Za-z]{4}$/.test(part));
  const lower = language.toLowerCase();
  return [lower, script ? script[0].toUpperCase() + script.slice(1).toLowerCase() : null, region ? region.toUpperCase() : null].filter(Boolean).join("-");
};

const acceptLanguage = (tag) => {
  const language = tag.split("-")[0];
  return language !== tag ? `${tag},${language};q=0.9` : tag;
};

// MARK: - Requests

/// What Safari asks for, by the kind of thing a request loads.
const ACCEPT_DOCUMENT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const ACCEPT_IMAGE_17 = "image/webp,image/avif,image/jxl,image/heic,image/heic-sequence,video/*;q=0.8,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5";
const ACCEPT_IMAGE_16 = "image/webp,image/avif,video/*;q=0.8,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5";
const ACCEPT_STYLE = "text/css,*/*;q=0.1";

/// Headers Chromium sends and Safari doesn't: client hints, the user's
/// click, the ask to upgrade to https://, Chrome's storage access, topics,
/// shared storage, ad auctions, private tokens and attribution reporting.
const CHROME_ONLY_HEADER = /^(sec-ch-|sec-fetch-user$|upgrade-insecure-requests$|sec-fetch-storage-access$|sec-browsing-topics$|sec-shared-storage|sec-ad-auction|sec-private-state-token|attribution-reporting|x-client-data$)/;

/// The order Safari sends its headers in (iOS 17 and 18 differ), the rest
/// after them as they came.
const ORDER_17 = ["accept", "sec-fetch-site", "accept-encoding", "sec-fetch-mode", "user-agent", "accept-language", "sec-fetch-dest"];
const ORDER_18 = ["sec-fetch-dest", "user-agent", "accept", "sec-fetch-site", "sec-fetch-mode", "accept-language", "priority", "accept-encoding"];

/// A request's headers as Safari on `iphone` sends them: no client hints
/// (Safari has none), no Sec-Fetch-User or Upgrade-Insecure-Requests,
/// Safari's Accept for documents, images and style sheets (what a page set
/// itself, as for fetch(), stays), its encodings and languages, in its
/// order. `type` is Electron's resource type ("mainFrame", "image"…).
const safariHeaders = (headers, { type, iphone, language }) => {
  const out = {};
  const names = Object.keys(headers);
  const find = (lower) => names.find((name) => name.toLowerCase() === lower);
  const get = (lower) => {
    const name = find(lower);
    return name === undefined ? undefined : headers[name];
  };
  const values = {};
  for (const name of names) {
    const lower = name.toLowerCase();
    if (CHROME_ONLY_HEADER.test(lower)) {
      continue;
    }
    values[lower] = { name, value: headers[name] };
  }
  const accept = get("accept");
  const imageAccept = atLeast(iphone, "17") ? ACCEPT_IMAGE_17 : ACCEPT_IMAGE_16;
  if (type === "mainFrame" || type === "subFrame") {
    if (accept === undefined || /^text\/html,/.test(accept)) {
      values.accept = { name: find("accept") || "Accept", value: ACCEPT_DOCUMENT };
    }
  } else if (type === "image") {
    if (accept === undefined || /^image\//.test(accept)) {
      values.accept = { name: find("accept") || "Accept", value: imageAccept };
    }
  } else if (type === "stylesheet") {
    if (accept === undefined || /^text\/css/.test(accept)) {
      values.accept = { name: find("accept") || "Accept", value: ACCEPT_STYLE };
    }
  }
  const encoding = get("accept-encoding");
  if (encoding !== undefined) {
    const offered = String(encoding).split(",").map((item) => item.trim()).filter(Boolean);
    // zstd from iOS 26; Brotli where Chromium offers it (over https://).
    const kept = offered.filter((item) => item !== "zstd" || atLeast(iphone, "26"));
    values["accept-encoding"] = { name: find("accept-encoding"), value: kept.join(", ") };
  }
  if (language && get("accept-language") !== undefined) {
    values["accept-language"] = { name: find("accept-language"), value: acceptLanguage(language) };
  }
  const order = atLeast(iphone, "18") ? ORDER_18 : ORDER_17;
  for (const lower of order) {
    if (values[lower]) {
      out[values[lower].name] = values[lower].value;
      delete values[lower];
    }
  }
  for (const { name, value } of Object.values(values)) {
    out[name] = value;
  }
  return out;
};

// MARK: - The page area

/// What Chromium is told to show a tab's page (the debugging protocol's
/// Emulation.setDeviceMetricsOverride): the device's page area at its
/// pixel density and its screen, upright (as Safari reports it), scroll
/// bars drawn over the page. An iPhone's page is a phone's (its viewport
/// tag counts), upright; an iPad's, sideways, a phone's on a mini and a
/// computer's on the others (as wide as the window, whatever its viewport
/// tag says, as Safari shows an iPad desktop websites). `pageHeight`: the
/// page area's height, less than Safari's on a short PC screen (as on a
/// device whose toolbar or keyboard shows); `scale`, how big Chromium draws
/// the page, smaller on a PC screen too narrow for an iPad's (the page
/// sees the same sizes).
const deviceMetrics = (device, pageHeight = device.pageHeight, scale = 1) => ({
  width: device.pageWidth,
  height: pageHeight,
  deviceScaleFactor: device.scale,
  mobile: !device.desktop,
  ...(device.desktop ? { scrollbarType: "overlay" } : {}),
  scale,
  screenWidth: device.width,
  screenHeight: device.height,
  positionX: 0,
  positionY: 0,
  screenOrientation: device.family === "ipad" ? { type: "landscapePrimary", angle: 90 } : { type: "portraitPrimary", angle: 0 },
});

/// What a page script of Noor iPhone is told (see scripts/parts/iphone.js).
/// The window is the whole screen, held as the device is (WebKit's outer
/// size is its web view's, which Safari lays under its bars).
const pageConfig = (device) => ({
  family: device.family,
  model: device.name,
  userAgent: userAgent(device),
  platform: device.platform,
  cores: device.cores,
  desktop: device.desktop,
  iOS: device.iOS,
  safari: device.safari,
  hdr: device.hdr,
  width: device.width,
  height: device.height,
  outerWidth: device.pageWidth,
  outerHeight: device.fullHeight,
});

module.exports = {
  IPHONES, IPADS, DEVICES, FAMILIES, device, isIPhone, userAgent, compareVersions, atLeast, languageTag, acceptLanguage, safariHeaders,
  deviceMetrics, pageConfig, ACCEPT_DOCUMENT, ACCEPT_STYLE, ACCEPT_IMAGE_16, ACCEPT_IMAGE_17,
};
