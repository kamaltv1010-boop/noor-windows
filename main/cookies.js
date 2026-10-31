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

module.exports = { describe, siteOf, groupBySite, cookieURL, netscape, asJSON, cookieTools };
