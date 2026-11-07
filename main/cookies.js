"use strict";
const { siteKey } = require("./warmup");

/// A profile's cookies, as the Cookies page shows them (renderer/cookies.html):
/// by site, each with what Chromium keeps of it; a site's taken away; all
/// of them written out as a cookies.txt file (the Netscape format curl,
/// yt-dlp and the "cookies.txt" extensions use) or as JSON.

/// What the page is told of a cookie (Electron's, with its expiry as a date).
const describe = (cookie) => ({
  name: String(cookie.name || ""),
  value: String(cookie.value || ""),
  domain: String(cookie.domain || ""),
  path: String(cookie.path || "/"),
  secure: Boolean(cookie.secure),
  httpOnly: Boolean(cookie.httpOnly),
  hostOnly: Boolean(cookie.hostOnly),
  sameSite: String(cookie.sameSite || "unspecified"),
  session: Boolean(cookie.session) || !cookie.expirationDate,
  expires: !cookie.session && cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toISOString() : null,
});

/// The site a cookie is for ("hespress.com" for ".www.hespress.com").
const siteOf = (cookie) => siteKey(String(cookie.domain || "").replace(/^\./, ""));

/// Cookies by site: the sites with the most first, each site's cookies by
/// name.
const groupBySite = (cookies) => {
  const sites = new Map();
  for (const cookie of cookies || []) {
    const site = siteOf(cookie) || "(no site)";
    if (!sites.has(site)) {
      sites.set(site, []);
    }
    sites.get(site).push(describe(cookie));
  }
  return [...sites.entries()]
    .map(([site, list]) => ({ site, count: list.length, cookies: list.sort((a, b) => a.name.localeCompare(b.name) || a.domain.localeCompare(b.domain)) }))
    .sort((a, b) => b.count - a.count || a.site.localeCompare(b.site));
};

/// The address Chromium takes a cookie away by.
const cookieURL = (cookie) => `${cookie.secure ? "https" : "http"}://${String(cookie.domain || "").replace(/^\./, "")}${cookie.path || "/"}`;

/// Cookies as a cookies.txt file: domain, whether its subdomains get it,
/// path, secure, expiry (0 for a cookie kept only while the browser runs),
/// name, value; an HttpOnly one's domain starts with "#HttpOnly_", as curl
/// writes it.
const netscape = (cookies) => {
  const lines = [
    "# Netscape HTTP Cookie File",
    "# https://curl.se/docs/http-cookies.html",
    "# Written by Noor. Every cookie of one profile.",
    "",
  ];
  for (const cookie of cookies || []) {
    const domain = String(cookie.domain || "");
    const subdomains = !cookie.hostOnly && domain.startsWith(".");
    const expires = cookie.session || !cookie.expirationDate ? 0 : Math.floor(cookie.expirationDate);
    const clean = (text) => String(text == null ? "" : text).replace(/[\t\r\n]/g, " ");
    lines.push([
      (cookie.httpOnly ? "#HttpOnly_" : "") + clean(domain),
      subdomains ? "TRUE" : "FALSE",
      clean(cookie.path || "/"),
      cookie.secure ? "TRUE" : "FALSE",
      String(expires),
      clean(cookie.name),
      clean(cookie.value),
    ].join("\t"));
  }
  return lines.join("\n") + "\n";
};

/// Cookies as JSON, as the page describes them.
const asJSON = (cookies) => JSON.stringify((cookies || []).map(describe), null, 2) + "\n";

// MARK: - A page's cookies as its Cookie header

/// The cookies a page's address gets (`cookies`, Electron's for that
/// address), as the browser writes them in the request's Cookie header:
/// "name=value; name2=value2", those of a longer path first, as Chromium
/// sends them; a cookie with no name is its value alone.
const headerString = (cookies) => (cookies || [])
  .map((cookie, index) => ({ cookie, index }))
  .sort((a, b) => String(b.cookie.path || "/").length - String(a.cookie.path || "/").length || a.index - b.index)
  .map(({ cookie }) => (cookie.name ? `${cookie.name}=${cookie.value == null ? "" : cookie.value}` : String(cookie.value || "")))
  .join("; ");

/// A cookie's name as Chromium takes it: no control character, no space,
/// none of the separators.
const validName = (name) => name.length > 0 && name.length <= 4096 && !/[\x00-\x20\x7f()<>@,;:\\"/[\]?={}]/.test(name);
/// A value: no control character, no ";".
const validValue = (value) => value.length <= 4096 && !/[\x00-\x1f\x7f;]/.test(value);

/// The cookies in a Cookie header's text ("name=value; name2=value2"),
/// as it is copied: with "Cookie:" before it or not, or among a request's
/// other headers (its Cookie lines are taken). Each pair as { name, value },
/// a name given twice taken the last time; `skipped`, the pairs that are no
/// cookie.
const parseHeaderString = (text) => {
  let body = String(text == null ? "" : text).replace(/^\uFEFF/, "");
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const cookieLines = lines.filter((line) => /^cookie\s*:/i.test(line));
  if (cookieLines.length) {
    body = cookieLines.map((line) => line.replace(/^cookie\s*:/i, "")).join("; ");
  } else if (lines.length > 1 && lines.every((line) => /^[A-Za-z0-9-]+\s*:\s/.test(line))) {
    // A request's headers with no Cookie line: nothing.
    body = "";
  } else {
    body = lines.join("; ");
  }
  const byName = new Map();
  const skipped = [];
  for (const part of body.split(";")) {
    const pair = part.trim();
    if (!pair) {
      continue;
    }
    const at = pair.indexOf("=");
    const name = at === -1 ? "" : pair.slice(0, at).trim();
    const value = at === -1 ? pair : pair.slice(at + 1).trim();
    if (!validName(name) || !validValue(value)) {
      skipped.push(pair.length > 40 ? pair.slice(0, 40) + "…" : pair);
      continue;
    }
    byName.delete(name);
    byName.set(name, { name, value });
  }
  return { cookies: [...byName.values()], skipped };
};

/// A year, in seconds: how long a cookie made from a header's text is kept
/// (the text tells no expiry; one of the same name keeps its own).
const IMPORT_LIFETIME = 365 * 24 * 60 * 60;

/// What a cookie of `pair` is set as for the page at `url`: like the
/// page's own cookie of that name if it has one (its domain, path, flags
/// and expiry); else for the whole site (".example.com", so its subdomains
/// get it too; an address like 127.0.0.1 or localhost has it alone, and a
/// "__Host-" one its host, as Chromium wants it), at "/", secure on https,
/// kept a year.
const importDetails = (pair, url, existing = null, now = Date.now()) => {
  const page = new URL(url);
  const secure = page.protocol === "https:";
  const details = { url: `${page.protocol}//${page.host}/`, name: pair.name, value: pair.value };
  if (existing) {
    const domain = String(existing.domain || "");
    if (!existing.hostOnly && domain) {
      details.domain = domain;
    }
    details.path = existing.path || "/";
    details.secure = Boolean(existing.secure) && secure;
    details.httpOnly = Boolean(existing.httpOnly);
    if (existing.sameSite && existing.sameSite !== "unspecified") {
      details.sameSite = existing.sameSite;
    }
    if (!existing.session && existing.expirationDate) {
      details.expirationDate = existing.expirationDate;
    }
    return details;
  }
  const host = page.hostname.toLowerCase();
  const hostOnly = !host.includes(".") || /^\d+(\.\d+){3}$/.test(host) || host.includes(":") || host.startsWith("[") || /^__host-/i.test(pair.name);
  if (!hostOnly) {
    details.domain = "." + siteKey(host);
  }
  details.path = "/";
  details.secure = secure;
  details.httpOnly = false;
  details.expirationDate = Math.floor(now / 1000) + IMPORT_LIFETIME;
  return details;
};

/// The Cookie header of the page at `url` in `session` (its tab's: a
/// private tab's are its own): the text and how many cookies it holds.
const pageCookieHeader = async (session, url) => {
  const cookies = await session.cookies.get({ url });
  return { count: cookies.length, text: headerString(cookies) };
};

/// Sets the cookies of a Cookie header's `text` for the page at `url` in
/// `session` (see importDetails), and writes them out: how many were set,
/// the pairs that are no cookie, and those Chromium refused.
const importCookieHeader = async (session, url, text, now = Date.now()) => {
  const { cookies, skipped } = parseHeaderString(text);
  const current = await session.cookies.get({ url });
  const refused = [];
  let set = 0;
  for (const pair of cookies) {
    const existing = current.find((cookie) => cookie.name === pair.name) || null;
    try {
      await session.cookies.set(importDetails(pair, url, existing, now));
      set += 1;
    } catch (error) {
      refused.push(pair.name);
    }
  }
  if (set) {
    try {
      await session.cookies.flushStore();
    } catch (error) {
      // Written out later.
    }
  }
  return { set, skipped, refused };
};

/// What the page and the IPC use: `sessionFor(profile)` gives a profile's
/// normal session.
const cookieTools = (sessionFor) => ({
  async list(profile) {
    const cookies = await sessionFor(profile).cookies.get({});
    return { total: cookies.length, sites: groupBySite(cookies) };
  },

  /// Takes away every cookie of `site` in `profile`; how many went.
  async removeSite(profile, site) {
    const ses = sessionFor(profile);
    const cookies = (await ses.cookies.get({})).filter((cookie) => siteOf(cookie) === site);
    let removed = 0;
    for (const cookie of cookies) {
      try {
        await ses.cookies.remove(cookieURL(cookie), cookie.name);
        removed += 1;
      } catch (error) {
        // One that can't be taken away stays.
      }
    }
    try {
      await ses.cookies.flushStore();
    } catch (error) {
      // Written out later.
    }
    return removed;
  },

  /// The text of `profile`'s cookies in `format` ("txt" or "json").
  async exported(profile, format) {
    const cookies = await sessionFor(profile).cookies.get({});
    return { count: cookies.length, text: format === "json" ? asJSON(cookies) : netscape(cookies) };
  },
});

module.exports = { describe, siteOf, groupBySite, cookieURL, netscape, asJSON, cookieTools, headerString, parseHeaderString, importDetails, pageCookieHeader, importCookieHeader, validName, validValue, IMPORT_LIFETIME };
