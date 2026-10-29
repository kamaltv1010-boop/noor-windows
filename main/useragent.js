"use strict";

/// What pages see of the browser: Google Chrome on Windows, the version
/// this app's Chromium is, without the Electron and app names Chromium
/// would add.
const chromeVersion = () => (process.versions.chrome || "0").split(".")[0];

/// Chrome's reduced user agent: the major version, the rest zeros.
const userAgent = () => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion()}.0.0.0 Safari/537.36`;

const GREASEY_CHARS = [" ", "(", ":", "-", ".", "/", ")", ";", "=", "?", "_"];
const GREASEY_VERSIONS = ["8", "99", "24"];
const ORDERS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

/// The brands Chrome lists (Sec-CH-UA and navigator.userAgentData): a
/// "Not A Brand" entry with the characters and version Chrome picks from
/// its major version, Chromium, and Google Chrome, in Chrome's order for
/// that version. `greasey` can give the "Not A Brand" entry Chromium
/// itself sent, when known.
const brands = (major = chromeVersion(), greasey = null) => {
  const seed = Number(major) || 0;
  const notABrand = greasey || {
    brand: `Not${GREASEY_CHARS[seed % GREASEY_CHARS.length]}A${GREASEY_CHARS[(seed + 1) % GREASEY_CHARS.length]}Brand`,
    version: GREASEY_VERSIONS[seed % GREASEY_VERSIONS.length],
  };
  const order = ORDERS[seed % ORDERS.length];
  const list = [];
  list[order[0]] = notABrand;
  list[order[1]] = { brand: "Chromium", version: String(seed) };
  list[order[2]] = { brand: "Google Chrome", version: String(seed) };
  return list;
};

/// Parses a Sec-CH-UA header, `"Brand";v="1", "Other";v="2"`.
const parseBrands = (header) => {
  const list = [];
  for (const match of String(header || "").matchAll(/"([^"]*)";\s*v="([^"]*)"/g)) {
    list.push({ brand: match[1], version: match[2] });
  }
  return list;
};

const formatBrands = (list) => list.map((b) => `"${b.brand}";v="${b.version}"`).join(", ");

/// The languages a page is told of, as Chrome lists them for a user
/// whose system is in `locale`: the locale, its language alone, then
/// English ("fr-FR,fr,en-US,en"; "en-US,en"). Chromium alone lists only
/// the locale, which a site that knows Chrome's lists would notice.
const acceptLanguages = (locale) => {
  const tag = String(locale || "en-US").replace(/_/g, "-");
  const language = tag.split("-")[0].toLowerCase();
  const list = [];
  if (tag !== language) {
    list.push(tag);
  }
  if (language !== "en") {
    list.push(language, "en-US", "en");
  } else {
    if (!list.length) list.push("en-US");
    list.push("en");
  }
  return list.filter((item, index) => list.indexOf(item) === index).join(",");
};

/// The Accept-Language header Chrome sends for a list of languages:
/// "en-US,en;q=0.9", "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7".
const acceptLanguageHeader = (list) => String(list || "").split(",").filter(Boolean)
  .map((tag, index) => (index === 0 ? tag : `${tag};q=${Math.max(1, 10 - index) / 10}`)).join(",");

/// What Chrome tells of itself beside the user agent (navigator.userAgentData
/// and the Sec-CH-UA headers): its brands, and the system's own details
/// (`highEntropy`: platformVersion, architecture, bitness, wow64, model,
/// formFactors, read from Chromium itself), as the debugging protocol's
/// override takes it, so the headers of a navigation carry it too.
const userAgentMetadata = ({ brandList, fullVersionList, highEntropy }) => {
  const known = highEntropy && typeof highEntropy === "object" ? highEntropy : {};
  return {
    brands: brandList.map((b) => ({ brand: b.brand, version: b.version })),
    fullVersionList: fullVersionList.map((b) => ({ brand: b.brand, version: b.version })),
    platform: "Windows",
    platformVersion: typeof known.platformVersion === "string" ? known.platformVersion : "15.0.0",
    architecture: typeof known.architecture === "string" ? known.architecture : "x86",
    model: typeof known.model === "string" ? known.model : "",
    mobile: false,
    bitness: typeof known.bitness === "string" ? known.bitness : "64",
    wow64: typeof known.wow64 === "boolean" ? known.wow64 : false,
    formFactors: Array.isArray(known.formFactors) && known.formFactors.length ? known.formFactors : ["Desktop"],
  };
};

module.exports = { chromeVersion, userAgent, brands, parseBrands, formatBrands, acceptLanguages, acceptLanguageHeader, userAgentMetadata };
