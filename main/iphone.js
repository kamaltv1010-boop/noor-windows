"use strict";

/// Noor iPhone: the same browser, built as an app of its own (see
/// tools/build-iphone.js), in which every profile is one real iPhone to the
/// sites it opens, as in the iPhone app: Safari's user agent and requests,
/// the iPhone's screen, pixel density and touch, and what Safari on that
/// iPhone has and lacks (see scripts/parts/iphone.js).

/// The device this build shows: "iphone" in Noor iPhone (written into its
/// package.json by tools/build-iphone.js; from the source, `npm run
/// start:iphone` or NOOR_DEVICE=iphone), "windows" otherwise.
const device = () => {
  if (process.env.NOOR_DEVICE) {
    return process.env.NOOR_DEVICE === "iphone" ? "iphone" : "windows";
  }
  if (process.argv.includes("--noor-iphone")) {
    return "iphone";
  }
  try {
    return require("../package.json").noorDevice === "iphone" ? "iphone" : "windows";
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
].map(([name, width, height, scale, hdr, pageHeight, iOS, uaOS, safari]) => ({ name, width, height, scale, hdr, pageHeight, iOS, uaOS, safari }));

/// Safari's user agent on `iphone`.
const userAgent = (iphone) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${iphone.uaOS} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${iphone.safari} Mobile/15E148 Safari/604.1`;

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
/// Emulation.setDeviceMetricsOverride): the iPhone's page area at its pixel
/// density, as a phone (the page's viewport tag counts, scroll bars are
/// drawn over the page), its screen, upright. `pageHeight`: the page
/// area's height, less than Safari's on a short PC screen (as on an iPhone
/// whose toolbar or keyboard shows).
const deviceMetrics = (iphone, pageHeight = iphone.pageHeight) => ({
  width: iphone.width,
  height: pageHeight,
  deviceScaleFactor: iphone.scale,
  mobile: true,
  scale: 1,
  screenWidth: iphone.width,
  screenHeight: iphone.height,
  positionX: 0,
  positionY: 0,
  screenOrientation: { type: "portraitPrimary", angle: 0 },
});

/// What a page script of Noor iPhone is told (see scripts/parts/iphone.js).
const pageConfig = (iphone) => ({
  model: iphone.name,
  userAgent: userAgent(iphone),
  iOS: iphone.iOS,
  safari: iphone.safari,
  hdr: iphone.hdr,
  width: iphone.width,
  height: iphone.height,
});

module.exports = {
  IPHONES, device, isIPhone, userAgent, compareVersions, atLeast, languageTag, acceptLanguage, safariHeaders,
  deviceMetrics, pageConfig, ACCEPT_DOCUMENT, ACCEPT_STYLE, ACCEPT_IMAGE_16, ACCEPT_IMAGE_17,
};
