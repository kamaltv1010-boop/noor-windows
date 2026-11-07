"use strict";
const crypto = require("crypto");
const { siteKey } = require("./warmup");
const { parseHeaderString, importDetails, validName, validValue, IMPORT_LIFETIME } = require("./cookies");
const { writeWhole, readWhole } = require("./store");

/// The cookies every new profile starts with (Settings › Cookies, "Cookies
/// of every new profile"): kept by site, and set in each profile made (one,
/// many at once, or one made in a closed profile's place, see
/// Windows.seedNew) before it collects its own, each kept a year from then,
/// as cookies pasted into a page are. They come as a page's Cookie header
/// gives them ("name=value; name2=value2", what Ctrl+O copies), with the
/// site they are for, or as a cookies.txt file or JSON (Noor's own, see
/// main/cookies.js, or another browser's or extension's), which tell their
/// sites. Their values are kept sealed by the system (on Windows, DPAPI,
/// through Electron's safeStorage) where it can, as Chromium keeps the
/// profiles' own; in a file of their own, not settings.json, which is
/// written far more often.

/// At most: the text added at once, the cookies kept, their sites.
const MAX_TEXT = 5 * 1024 * 1024;
const MAX_COOKIES = 5000;
const MAX_SITES = 500;

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const short = (text) => {
  const line = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
};

/// SameSite as Electron takes it, from what exports write ("None", "Lax",
/// "no_restriction"…); "unspecified" for anything else.
const SAME_SITE = { no_restriction: "no_restriction", none: "no_restriction", lax: "lax", strict: "strict" };
const sameSiteOf = (value) => SAME_SITE[String(value == null ? "" : value).trim().toLowerCase()] || "unspecified";

/// The site's field as a person writes it ("instagram.com",
/// "https://www.instagram.com/accounts/"): its address, https when no
/// scheme is written; null when it is no web address.
const siteAddress = (text) => {
  let written = String(text == null ? "" : text).trim();
  if (!written) {
    return null;
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(written)) {
    written = `https://${written}`;
  }
  try {
    const url = new URL(written);
    return ["http:", "https:"].includes(url.protocol) && /^[a-z0-9._-]+$/i.test(url.hostname) && !url.hostname.includes("..") ? url : null;
  } catch (error) {
    return null;
  }
};

/// A cookie as it is kept: its name and value, its domain (".example.com"
/// when the site's subdomains get it too, else the host alone), path and
/// flags; as Chromium takes it: a "__Host-" one for its host alone, at "/",
/// secure; a "__Secure-" one secure; SameSite=None only on a secure one; a
/// host with no dot (localhost) or an address for itself alone. Null for
/// what is no cookie.
const keptCookie = (item) => {
  if (!isObject(item)) {
    return null;
  }
  const cookie = {
    name: String(item.name == null ? "" : item.name).trim(),
    value: String(item.value == null ? "" : item.value).trim(),
    domain: "",
    hostOnly: Boolean(item.hostOnly),
    path: String(item.path || "/").trim() || "/",
    secure: Boolean(item.secure),
    httpOnly: Boolean(item.httpOnly),
    sameSite: sameSiteOf(item.sameSite),
  };
  let host = String(item.domain == null ? "" : item.domain).trim().toLowerCase().replace(/^\./, "").replace(/\.$/, "");
  if (/[^\x00-\x7f]/.test(host)) {
    // A name in another script ("موقع.ma"): as Chromium keeps it, "xn--4gbrim.ma".
    try {
      host = new URL(`http://${host}/`).hostname;
    } catch (error) {
      return null;
    }
  }
  if (!host || !/^[a-z0-9._-]+$/.test(host) || host.includes("..") || host.startsWith(".")) {
    return null;
  }
  if (!host.includes(".") || /^\d+(\.\d+){3}$/.test(host)) {
    cookie.hostOnly = true;
  }
  if (/^__host-/i.test(cookie.name)) {
    cookie.hostOnly = true;
    cookie.path = "/";
    cookie.secure = true;
  } else if (/^__secure-/i.test(cookie.name)) {
    cookie.secure = true;
  }
  if (!cookie.path.startsWith("/")) {
    cookie.path = "/";
  }
  if (cookie.sameSite === "no_restriction" && !cookie.secure) {
    cookie.sameSite = "unspecified";
  }
  cookie.domain = cookie.hostOnly ? host : `.${host}`;
  if (!validName(cookie.name) || !validValue(cookie.value) || cookie.path.length > 1024 || /[\x00-\x1f\x7f;]/.test(cookie.path)) {
    return null;
  }
  return cookie;
};

/// A pair of a Cookie header's text for the site at `url` (a URL), as a
/// pasted one is set (see importDetails): for the whole site, at "/",
/// secure on https.
const pairCookie = (pair, url) => {
  const details = importDetails(pair, url.href);
  return keptCookie({ ...pair, domain: details.domain || url.hostname, hostOnly: !details.domain, path: details.path, secure: details.secure });
};

/// A cookie of an export's JSON (Noor's, Chrome extensions' such as
/// Cookie-Editor's, Playwright's, Puppeteer's): for its domain, or the
/// site's (`url`) when it tells none; for that host alone when it says
/// so ("hostOnly"), or when its domain has no dot before it.
const objectCookie = (item, url) => {
  if (!isObject(item)) {
    return null;
  }
  let domain = String(item.domain || item.host || "").trim();
  let hostOnly = item.hostOnly;
  if (!domain && url) {
    const details = importDetails({ name: String(item.name == null ? "" : item.name), value: "" }, url.href);
    domain = details.domain || url.hostname;
    hostOnly = !details.domain;
  }
  if (!domain) {
    return null;
  }
  return keptCookie({ ...item, domain, hostOnly: hostOnly == null ? !domain.startsWith(".") : Boolean(hostOnly) });
};

/// The cookies of a cookies.txt file (as Noor, curl and the "cookies.txt"
/// extensions write it): per line, domain, whether its subdomains get it,
/// path, secure, expiry, name and value, between tabs; "#HttpOnly_" before
/// an HttpOnly one's domain.
const netscapeCookies = (text) => {
  const cookies = [];
  const skipped = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw;
    let httpOnly = false;
    if (/^#HttpOnly_/i.test(line)) {
      httpOnly = true;
      line = line.slice("#HttpOnly_".length);
    } else if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }
    const fields = line.split("\t");
    if (fields.length < 7) {
      skipped.push(short(line));
      continue;
    }
    const [domain, subdomains, path, secure, , name, ...rest] = fields;
    const cookie = keptCookie({ domain, hostOnly: !/^true$/i.test(subdomains.trim()), path, secure: /^true$/i.test(secure.trim()), httpOnly, name, value: rest.join("\t") });
    if (cookie) {
      cookies.push(cookie);
    } else {
      skipped.push(short(name || line));
    }
  }
  return { cookies, skipped };
};

/// One cookie of each name, domain and path: the last given.
const keyOf = (cookie) => `${cookie.name}\n${cookie.domain}\n${cookie.path}`;
const unique = (cookies) => {
  const byKey = new Map();
  for (const cookie of cookies) {
    byKey.delete(keyOf(cookie));
    byKey.set(keyOf(cookie), cookie);
  }
  return [...byKey.values()];
};

/// The site a kept cookie is for ("instagram.com" for ".instagram.com").
const siteOfCookie = (cookie) => siteKey(cookie.domain.replace(/^\./, ""));

/// The cookies of `text`, whatever it is: an export's JSON, a cookies.txt
/// file, or a Cookie header's text, whose pairs are for the site at `url`
/// (with none, `needsSite`). `skipped`: what is no cookie.
const parseCookies = (text, url = null) => {
  const body = String(text == null ? "" : text).replace(/^﻿/, "").trim();
  if (!body) {
    return { format: "none", cookies: [], skipped: [] };
  }
  if (/^[[{]/.test(body)) {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      return { format: "json", cookies: [], skipped: [], error: "That JSON can't be read: it isn't whole, or isn't JSON." };
    }
    const list = Array.isArray(parsed) ? parsed : isObject(parsed) && Array.isArray(parsed.cookies) ? parsed.cookies : [parsed];
    const cookies = [];
    const skipped = [];
    for (const item of list) {
      const cookie = objectCookie(item, url);
      if (cookie) {
        cookies.push(cookie);
      } else {
        skipped.push(short(isObject(item) && item.name ? item.name : JSON.stringify(item)));
      }
    }
    return { format: "json", cookies: unique(cookies), skipped };
  }
  if (/^#\s*(Netscape )?HTTP Cookie File/im.test(body) || body.split(/\r?\n/).some((line) => line.split("\t").length >= 7)) {
    const { cookies, skipped } = netscapeCookies(body);
    return { format: "txt", cookies: unique(cookies), skipped };
  }
  const { cookies: pairs, skipped } = parseHeaderString(body);
  if (!url) {
    return { format: "header", cookies: [], skipped, needsSite: pairs.length > 0 };
  }
  const cookies = [];
  for (const pair of pairs) {
    const cookie = pairCookie(pair, url);
    if (cookie) {
      cookies.push(cookie);
    } else {
      skipped.push(short(pair.name));
    }
  }
  return { format: "header", cookies: unique(cookies), skipped };
};

/// What a kept cookie is set as in a new profile: as it is kept, from
/// `now` for a year.
const seedDetails = (cookie, now = Date.now()) => {
  const details = {
    url: `${cookie.secure ? "https" : "http"}://${cookie.domain.replace(/^\./, "")}${cookie.path}`,
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    expirationDate: Math.floor(now / 1000) + IMPORT_LIFETIME,
  };
  if (!cookie.hostOnly) {
    details.domain = cookie.domain;
  }
  if (cookie.sameSite !== "unspecified") {
    details.sameSite = cookie.sameSite;
  }
  return details;
};

/// A few of a list, and how many more.
const some = (list, count = 3) => (list.length > count ? `${list.slice(0, count).join(", ")} and ${list.length - count} more` : list.join(", "));

class NewProfileCookies {
  /// `file`: where they are kept (null: in memory only);
  /// `sessionFor(profile)`: a profile's normal session; `sealer`: the
  /// system's encryption, { available(), seal(text), open(sealed) }, or
  /// null.
  constructor(file, { sessionFor = null, sealer = null } = {}) {
    this.file = file;
    this.sessionFor = sessionFor;
    this.sealer = sealer;
    const kept = (file && readWhole(file, isObject)) || {};
    /// Whether new profiles get them (on at first; the list stays when off).
    this.enabled = kept.enabled !== false;
    /// Each site's: { id, site, names, count, sealed, cookies } (cookies:
    /// sealed text, or the list itself).
    this.sites = (Array.isArray(kept.sites) ? kept.sites : []).filter((entry) => isObject(entry) && typeof entry.id === "string" && typeof entry.site === "string");
    /// Each site's cookies as opened, by its id (null: they can't be).
    this.opened = new Map();
  }

  canSeal() {
    try {
      return Boolean(this.sealer && this.sealer.available());
    } catch (error) {
      return false;
    }
  }

  /// A site's cookies, opened; null when they can't be (sealed by another
  /// computer, or another Windows user).
  open(entry) {
    if (this.opened.has(entry.id)) {
      return this.opened.get(entry.id);
    }
    let cookies = null;
    try {
      const list = entry.sealed ? JSON.parse(this.sealer.open(entry.cookies)) : entry.cookies;
      cookies = Array.isArray(list) ? list.map(keptCookie).filter(Boolean) : null;
    } catch (error) {
      cookies = null;
    }
    this.opened.set(entry.id, cookies);
    return cookies;
  }

  /// Keeps `cookies` as the site's, sealed where the system can.
  keep(entry, cookies) {
    entry.names = [...new Set(cookies.map((cookie) => cookie.name))].sort((a, b) => a.localeCompare(b));
    entry.count = cookies.length;
    entry.sealed = false;
    entry.cookies = cookies;
    if (this.canSeal()) {
      try {
        entry.cookies = this.sealer.seal(JSON.stringify(cookies));
        entry.sealed = true;
      } catch (error) {
        entry.cookies = cookies;
        entry.sealed = false;
      }
    }
    this.opened.set(entry.id, cookies);
  }

  save() {
    // Kept unsealed when the system couldn't seal: sealed now if it can.
    for (const entry of this.sites) {
      const cookies = entry.sealed ? null : this.open(entry);
      if (cookies && this.canSeal()) {
        this.keep(entry, cookies);
      }
    }
    if (this.file) {
      writeWhole(this.file, JSON.stringify({ enabled: this.enabled, sites: this.sites }, null, 2));
    }
  }

  /// What the settings show: whether new profiles get them, and each
  /// site's cookies by name (never their values).
  state() {
    const sites = this.sites.map((entry) => {
      const cookies = this.open(entry);
      return {
        id: entry.id,
        site: entry.site,
        count: cookies ? cookies.length : Number(entry.count) || 0,
        names: Array.isArray(entry.names) ? entry.names.map(String) : [],
        unreadable: !cookies,
      };
    });
    return {
      enabled: this.enabled,
      sealed: this.sites.length > 0 && this.sites.every((entry) => entry.sealed),
      total: sites.reduce((sum, site) => sum + (site.unreadable ? 0 : site.count), 0),
      sites,
    };
  }

  /// Whether a profile made now gets cookies: on, with some.
  active() {
    return this.enabled && this.sites.some((entry) => this.open(entry));
  }

  /// The cookies of `text` (see parseCookies), those of a Cookie header's
  /// for the site `site` says, kept with the others of their sites (one of
  /// the same name, domain and path replaced). How many were added, for
  /// which sites, and what was left out; or why nothing was.
  add(site, text) {
    const body = String(text == null ? "" : text);
    if (body.length > MAX_TEXT) {
      return { added: 0, error: "That text is too long: 5 MB at most." };
    }
    const written = String(site == null ? "" : site).trim();
    const url = siteAddress(written);
    if (written && !url) {
      return { added: 0, error: `“${short(written)}” isn't a site's address: write one such as instagram.com.` };
    }
    const parsed = parseCookies(body, url);
    if (parsed.error) {
      return { added: 0, error: parsed.error };
    }
    if (parsed.needsSite) {
      return { added: 0, error: "Write the site these cookies are for (instagram.com, say): “name=value” doesn't tell it." };
    }
    if (!parsed.cookies.length) {
      return {
        added: 0,
        skipped: parsed.skipped,
        error: parsed.skipped.length ? `No cookie in that text could be kept (${some(parsed.skipped)}).` : "No cookies in that text.",
      };
    }
    const bySite = new Map();
    for (const cookie of parsed.cookies) {
      const key = siteOfCookie(cookie);
      if (!bySite.has(key)) {
        bySite.set(key, []);
      }
      bySite.get(key).push(cookie);
    }
    const next = new Map(this.sites.map((entry) => [entry.site, this.open(entry) || []]));
    for (const [key, list] of bySite) {
      next.set(key, unique((next.get(key) || []).concat(list)));
    }
    const total = [...next.values()].reduce((sum, list) => sum + list.length, 0);
    if (next.size > MAX_SITES || total > MAX_COOKIES) {
      return { added: 0, error: `That would be too many: ${MAX_COOKIES} cookies of ${MAX_SITES} sites at most.` };
    }
    for (const [key] of bySite) {
      let entry = this.sites.find((candidate) => candidate.site === key);
      if (!entry) {
        entry = { id: crypto.randomUUID(), site: key };
        this.sites.push(entry);
      }
      this.keep(entry, next.get(key));
    }
    this.sites.sort((a, b) => a.site.localeCompare(b.site));
    this.save();
    return { added: parsed.cookies.length, sites: [...bySite.keys()], skipped: parsed.skipped, format: parsed.format };
  }

  remove(id) {
    const before = this.sites.length;
    this.sites = this.sites.filter((entry) => entry.id !== id);
    this.opened.delete(id);
    if (this.sites.length !== before) {
      this.save();
    }
  }

  setEnabled(isOn) {
    this.enabled = Boolean(isOn);
    this.save();
  }

  /// Every cookie kept that can be opened.
  cookies() {
    return this.sites.flatMap((entry) => this.open(entry) || []);
  }

  /// Sets them in each of `profiles` (its normal session), kept a year from
  /// `now`, and writes them out: how many were set, and how many Chromium
  /// refused.
  async seed(profiles, now = Date.now()) {
    const cookies = this.enabled && this.sessionFor ? this.cookies() : [];
    const done = { set: 0, refused: 0 };
    if (!cookies.length) {
      return done;
    }
    await Promise.all((profiles || []).map(async (profile) => {
      let ses = null;
      try {
        ses = this.sessionFor(profile);
      } catch (error) {
        ses = null;
      }
      if (!ses) {
        return;
      }
      for (const cookie of cookies) {
        try {
          await ses.cookies.set(seedDetails(cookie, now));
          done.set += 1;
        } catch (error) {
          done.refused += 1;
        }
      }
      try {
        await ses.cookies.flushStore();
      } catch (error) {
        // Written out later.
      }
    }));
    return done;
  }
}

module.exports = { NewProfileCookies, parseCookies, keptCookie, siteAddress, seedDetails, netscapeCookies, MAX_TEXT, MAX_COOKIES, MAX_SITES };
