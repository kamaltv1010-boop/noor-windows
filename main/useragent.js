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

module.exports = { chromeVersion, userAgent, brands, parseBrands, formatBrands };
