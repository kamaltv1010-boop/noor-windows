"use strict";
const crypto = require("crypto");

/// Chrome extensions as Chrome gets them: the Chrome Web Store's pages,
/// the addresses Chrome downloads and updates them from, and the .crx
/// files it downloads, checked as Chrome checks them.

const STORE_URL = "https://chromewebstore.google.com/";
const UPDATE_URL = "https://clients2.google.com/service/update2/crx";
const ID_PATTERN = /^[a-p]{32}$/;

/// The extension ID of a store page (chromewebstore.google.com/detail/
/// <name>/<id>, or the old chrome.google.com/webstore/detail/…), or null.
const storeExtensionID = (url) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  const isStore = host === "chromewebstore.google.com" || (host === "chrome.google.com" && parsed.pathname.startsWith("/webstore"));
  if (!isStore || parsed.protocol !== "https:") {
    return null;
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (!parts.includes("detail")) {
    return null;
  }
  return parts.slice().reverse().find((part) => ID_PATTERN.test(part)) || null;
};

/// A store page's title without the store's name.
const storeTitle = (title) => String(title || "").replace(/\s*[-–—|]\s*Chrome Web Store\s*$/i, "").trim();

/// Where Chrome `chromeVersion` downloads extension `id` from.
const downloadURL = (id, chromeVersion) => {
  const url = new URL(UPDATE_URL);
  url.searchParams.set("response", "redirect");
  url.searchParams.set("acceptformat", "crx2,crx3");
  url.searchParams.set("prodversion", chromeVersion);
  url.searchParams.set("x", new URLSearchParams({ id, installsource: "ondemand", uc: "" }).toString());
  return url.toString();
};

/// Where Chrome asks whether its store extensions have new versions.
const updateCheckURL = (entries, chromeVersion) => {
  const url = new URL(UPDATE_URL);
  url.searchParams.set("response", "updatecheck");
  url.searchParams.set("acceptformat", "crx3");
  url.searchParams.set("prodversion", chromeVersion);
  for (const { id, version } of entries) {
    url.searchParams.append("x", new URLSearchParams({ id, v: version, uc: "" }).toString());
  }
  return url.toString();
};

const attribute = (text, name) => {
  const match = String(text).match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? match[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">") : null;
};

/// The new versions an update check's answer offers: id → { version, codebase }.
const parseUpdateResponse = (xml) => {
  const updates = new Map();
  for (const app of String(xml).matchAll(/<app\b([^>]*)>([\s\S]*?)<\/app>/g)) {
    const id = attribute(app[1], "appid");
    const check = app[2].match(/<updatecheck\b([^>]*?)\/?>/);
    if (!id || !check) {
      continue;
    }
    const version = attribute(check[1], "version");
    const codebase = attribute(check[1], "codebase");
    if (attribute(check[1], "status") === "ok" && version && codebase && /^https:\/\//i.test(codebase)) {
      updates.set(id, { version, codebase });
    }
  }
  return updates;
};

/// -1, 0 or 1 as dotted version `a` is older than, the same as, or newer than `b`.
const compareVersions = (a, b) => {
  const left = String(a || "0").split(".").map((part) => parseInt(part, 10) || 0);
  const right = String(b || "0").split(".").map((part) => parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference) {
      return difference < 0 ? -1 : 1;
    }
  }
  return 0;
};

/// The ID Chrome gives an extension with public key `key` (DER): the
/// first 16 bytes of its SHA-256, in the letters a to p.
const idOfKey = (key) => toIdAlphabet(crypto.createHash("sha256").update(key).digest("hex").slice(0, 32));
const toIdAlphabet = (hex) => hex.replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));

/// The length-delimited fields of a protocol buffer: number → [bytes].
const protobufFields = (buffer) => {
  const fields = {};
  let i = 0;
  const varint = () => {
    let value = 0;
    let shift = 0;
    let byte;
    do {
      if (i >= buffer.length) {
        throw new Error("The .crx file is cut short.");
      }
      byte = buffer[i++];
      value += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80 && shift < 64);
    return value;
  };
  while (i < buffer.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const type = key % 8;
    if (type === 0) {
      varint();
    } else if (type === 1) {
      i += 8;
    } else if (type === 5) {
      i += 4;
    } else if (type === 2) {
      const length = varint();
      if (i + length > buffer.length) {
        throw new Error("The .crx file is cut short.");
      }
      (fields[field] = fields[field] || []).push(buffer.subarray(i, i + length));
      i += length;
    } else {
      throw new Error("The .crx file's header can't be read.");
    }
  }
  return fields;
};

const publicKeyOf = (der) => crypto.createPublicKey({ key: der, format: "der", type: "spki" });

/// A .crx file, checked as Chrome checks it: the zip it holds, its
/// extension's ID and public key, and the format's version. The file must
/// be signed by the key its ID comes from, and the signature must match,
/// so a changed or damaged file is refused. Null for data that isn't a
/// .crx file at all (a .zip).
const parseCrx = (data) => {
  if (data.length < 12 || data.toString("latin1", 0, 4) !== "Cr24") {
    return null;
  }
  const version = data.readUInt32LE(4);
  if (version === 2) {
    if (data.length < 16) {
      throw new Error("The .crx file is cut short.");
    }
    const keyLength = data.readUInt32LE(8);
    const signatureLength = data.readUInt32LE(12);
    const start = 16 + keyLength + signatureLength;
    if (start > data.length) {
      throw new Error("The .crx file is cut short.");
    }
    const key = data.subarray(16, 16 + keyLength);
    const signature = data.subarray(16 + keyLength, start);
    const zip = data.subarray(start);
    if (!crypto.verify("sha1", zip, publicKeyOf(key), signature)) {
      throw new Error("The .crx file's signature doesn't match its contents.");
    }
    return { version, zip, publicKey: Buffer.from(key), id: idOfKey(key) };
  }
  if (version === 3) {
    const headerLength = data.readUInt32LE(8);
    if (12 + headerLength > data.length) {
      throw new Error("The .crx file is cut short.");
    }
    const header = protobufFields(data.subarray(12, 12 + headerLength));
    const zip = data.subarray(12 + headerLength);
    const signedData = (header[10000] || [])[0];
    const crxId = signedData && (protobufFields(signedData)[1] || [])[0];
    if (!crxId || crxId.length !== 16) {
      throw new Error("The .crx file doesn't say which extension it is.");
    }
    const id = toIdAlphabet(crxId.toString("hex"));
    const length = Buffer.alloc(4);
    length.writeUInt32LE(signedData.length, 0);
    const signed = Buffer.concat([Buffer.from("CRX3 SignedData\x00", "latin1"), length, signedData, zip]);
    // The developer's proof, by the key the ID comes from (RSA, field 2,
    // or ECDSA, field 3); the store adds one of its own beside it.
    let publicKey = null;
    for (const field of [2, 3]) {
      for (const proofData of header[field] || []) {
        const proof = protobufFields(proofData);
        const key = (proof[1] || [])[0];
        const signature = (proof[2] || [])[0];
        if (!key || !signature || idOfKey(key) !== id) {
          continue;
        }
        if (!crypto.verify("sha256", signed, publicKeyOf(key), signature)) {
          throw new Error("The .crx file's signature doesn't match its contents.");
        }
        publicKey = Buffer.from(key);
      }
    }
    if (!publicKey) {
      throw new Error("The .crx file isn't signed by its extension's own key.");
    }
    return { version, zip, publicKey, id };
  }
  throw new Error(`This .crx file's format (version ${version}) isn't known.`);
};

/// A manifest's text in the user's language: "__MSG_appName__" looked up
/// in the extension's _locales (`messages(locale)` reads one, or null).
const localized = (text, manifest, messages, languages = []) => {
  if (typeof text !== "string") {
    return "";
  }
  const match = text.match(/^__MSG_(\w+)__$/);
  if (!match) {
    return text;
  }
  const key = match[1].toLowerCase();
  const tried = new Set();
  for (const locale of languages.concat([manifest && manifest.default_locale, "en", "en_US"])) {
    if (!locale || tried.has(locale)) {
      continue;
    }
    tried.add(locale);
    const table = messages(locale);
    if (!table || typeof table !== "object") {
      continue;
    }
    const found = Object.keys(table).find((name) => name.toLowerCase() === key);
    if (found && table[found] && typeof table[found].message === "string") {
      return table[found].message;
    }
  }
  return "";
};

/// The user's languages as _locales folders: "fr-FR" → ["fr_FR", "fr"].
const localeFolders = (locale) => {
  const tag = String(locale || "en-US").replace(/-/g, "_");
  const language = tag.split("_")[0];
  return tag === language ? [tag] : [tag, language];
};

const ALL_SITES = /^(<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*|\*:\/\/\*\/|https?:\/\/\*\/)$/;

/// What an extension may do, as Chrome lists it before adding one.
const permissionSummary = (manifest) => {
  const lines = [];
  const permissions = new Set((manifest.permissions || []).filter((p) => typeof p === "string"));
  const hosts = [].concat(
    manifest.host_permissions || [],
    [...permissions].filter((p) => p === "<all_urls>" || p.includes("://")),
    ...(manifest.content_scripts || []).map((script) => script.matches || []),
  ).filter((h) => typeof h === "string");
  if (hosts.some((h) => ALL_SITES.test(h))) {
    lines.push("Read and change all your data on all websites");
  } else if (hosts.length) {
    const names = [...new Set(hosts.map((h) => h.replace(/^[^:]+:\/\/(\*\.)?/, "").replace(/\/.*$/, "")))].filter(Boolean);
    lines.push(`Read and change your data on ${names.slice(0, 4).join(", ")}${names.length > 4 ? ` and ${names.length - 4} more` : ""}`);
  }
  const named = [
    [["tabs", "history", "topSites", "webNavigation"], "Read your browsing history"],
    [["declarativeNetRequest", "declarativeNetRequestWithHostAccess", "webRequestBlocking"], "Block content on any page"],
    [["downloads"], "Manage your downloads"],
    [["clipboardRead"], "Read data you copy and paste"],
    [["clipboardWrite"], "Modify data you copy and paste"],
    [["bookmarks"], "Read and change your bookmarks"],
    [["management"], "Manage your apps, extensions, and themes"],
    [["proxy"], "Change your proxy settings"],
    [["privacy"], "Change your privacy-related settings"],
    [["nativeMessaging"], "Communicate with cooperating native applications"],
    [["geolocation"], "Detect your physical location"],
    [["notifications"], "Display notifications"],
  ];
  for (const [names, line] of named) {
    if (names.some((name) => permissions.has(name))) {
      lines.push(line);
    }
  }
  return lines;
};

module.exports = {
  STORE_URL, ID_PATTERN, storeExtensionID, storeTitle, downloadURL, updateCheckURL, parseUpdateResponse,
  compareVersions, idOfKey, parseCrx, localized, localeFolders, permissionSummary, protobufFields,
};
