"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { describe, groupBySite, cookieURL, netscape, asJSON, cookieTools } = require("../main/cookies");

/// Cookies as Electron gives them.
const COOKIES = [
  { name: "NID", value: "511=abc", domain: ".google.com", hostOnly: false, path: "/", secure: true, httpOnly: true, session: false, expirationDate: 1800000000.5, sameSite: "no_restriction" },
  { name: "AEC", value: "xyz", domain: ".google.com", hostOnly: false, path: "/", secure: true, httpOnly: true, session: false, expirationDate: 1790000000, sameSite: "lax" },
  { name: "lang", value: "ar", domain: "www.hespress.com", hostOnly: true, path: "/", secure: false, httpOnly: false, session: true, sameSite: "unspecified" },
  { name: "_ga", value: "GA1.1.1\ttab", domain: ".hespress.com", hostOnly: false, path: "/", secure: false, httpOnly: false, session: false, expirationDate: 1795000000, sameSite: "unspecified" },
  { name: "ig_did", value: "1", domain: ".instagram.com", hostOnly: false, path: "/", secure: true, httpOnly: true, session: false, expirationDate: 1795000000, sameSite: "strict" },
];

test("a cookie as the page shows it: its expiry as a date, a session cookie as one", () => {
  assert.deepEqual(describe(COOKIES[0]), {
    name: "NID", value: "511=abc", domain: ".google.com", path: "/", secure: true, httpOnly: true, hostOnly: false,
    sameSite: "no_restriction", session: false, expires: new Date(1800000000500).toISOString(),
  });
  assert.equal(describe(COOKIES[2]).session, true);
  assert.equal(describe(COOKIES[2]).expires, null);
});

test("cookies by site: the sites with the most first, a site's subdomains with it", () => {
  const sites = groupBySite(COOKIES);
  assert.deepEqual(sites.map((s) => [s.site, s.count]), [["google.com", 2], ["hespress.com", 2], ["instagram.com", 1]]);
  assert.deepEqual(sites[0].cookies.map((c) => c.name), ["AEC", "NID"]);
  assert.deepEqual(groupBySite([]), []);
});

test("a cookie is taken away by its own address", () => {
  assert.equal(cookieURL(COOKIES[0]), "https://google.com/");
  assert.equal(cookieURL(COOKIES[2]), "http://www.hespress.com/");
  assert.equal(cookieURL({ domain: ".x.ma", path: "/a", secure: false }), "http://x.ma/a");
});

test("cookies.txt as curl writes it: HttpOnly marked, subdomains, a session cookie's expiry 0, no tab in a value", () => {
  const text = netscape(COOKIES);
  const lines = text.trim().split("\n");
  assert.equal(lines[0], "# Netscape HTTP Cookie File");
  const rows = lines.filter((line) => line && !line.startsWith("# "));
  assert.equal(rows.length, 5);
  assert.equal(rows[0], "#HttpOnly_.google.com\tTRUE\t/\tTRUE\t1800000000\tNID\t511=abc");
  assert.equal(rows[2], "www.hespress.com\tFALSE\t/\tFALSE\t0\tlang\tar");
  assert.equal(rows[3], ".hespress.com\tTRUE\t/\tFALSE\t1795000000\t_ga\tGA1.1.1 tab");
  for (const row of rows) {
    assert.equal(row.split("\t").length, 7, row);
  }
  assert.deepEqual(JSON.parse(asJSON(COOKIES)).map((c) => c.name), COOKIES.map((c) => c.name));
});

test("a site's cookies are taken away from its profile's session, the others stay", async () => {
  const kept = COOKIES.slice();
  const removed = [];
  const ses = {
    cookies: {
      get: async () => kept.slice(),
      remove: async (url, name) => {
        removed.push(`${url} ${name}`);
        const at = kept.findIndex((c) => c.name === name && cookieURL(c) === url);
        if (at !== -1) kept.splice(at, 1);
      },
      flushStore: async () => {},
    },
  };
  const asked = [];
  const tools = cookieTools((profile) => {
    asked.push(profile.id);
    return ses;
  });
  const profile = { id: "p2", name: "Profile 2" };
  assert.equal((await tools.list(profile)).total, 5);
  assert.equal(await tools.removeSite(profile, "hespress.com"), 2);
  assert.deepEqual(removed, ["http://www.hespress.com/ lang", "http://hespress.com/ _ga"]);
  assert.deepEqual((await tools.list(profile)).sites.map((s) => s.site), ["google.com", "instagram.com"]);
  const exported = await tools.exported(profile, "txt");
  assert.equal(exported.count, 3);
  assert.ok(exported.text.includes("ig_did"));
  assert.ok(asked.every((id) => id === "p2"));
});

// MARK: - A page's cookies as its Cookie header

const { headerString, parseHeaderString, importDetails, importCookieHeader, IMPORT_LIFETIME } = require("../main/cookies");

test("a page's cookies as its Cookie header: name=value pairs, a longer path first, HttpOnly ones too, a nameless one its value", () => {
  const cookies = [
    { name: "sid", value: "abc", path: "/", httpOnly: true },
    { name: "pref", value: "a=b", path: "/app" },
    { name: "", value: "bare", path: "/" },
    { name: "lang", value: "", path: "/" },
  ];
  assert.equal(headerString(cookies), "pref=a=b; sid=abc; bare; lang=");
  assert.equal(headerString([]), "");
});

test("a Cookie header's text read back: with Cookie: or not, among a request's headers, the last of a name, no non-cookie", () => {
  assert.deepEqual(parseHeaderString("sid=abc; pref=a=b;  lang=ar  ").cookies, [{ name: "sid", value: "abc" }, { name: "pref", value: "a=b" }, { name: "lang", value: "ar" }]);
  assert.deepEqual(parseHeaderString("Cookie: sid=abc").cookies, [{ name: "sid", value: "abc" }]);
  assert.deepEqual(parseHeaderString("﻿cookie:sid=abc").cookies, [{ name: "sid", value: "abc" }]);
  // A request's headers, as a developer tool copies them: its Cookie lines only.
  assert.deepEqual(parseHeaderString("GET / HTTP/1.1\nHost: example.com\nCookie: a=1; b=2\nUser-Agent: x\ncookie: c=3").cookies.map((c) => c.name), ["a", "b", "c"]);
  assert.deepEqual(parseHeaderString("Host: example.com\nUser-Agent: x").cookies, []);
  // Lines of pairs.
  assert.deepEqual(parseHeaderString("a=1\nb=2").cookies.map((c) => c.name), ["a", "b"]);
  // The same name twice: the last one, where it is.
  assert.deepEqual(parseHeaderString("a=1; b=2; a=3").cookies, [{ name: "b", value: "2" }, { name: "a", value: "3" }]);
  // Quotes are part of a value, as the browser keeps them.
  assert.deepEqual(parseHeaderString('t="x y"').cookies, [{ name: "t", value: '"x y"' }]);
  const bad = parseHeaderString("good=1; bad name=2; =nameless; justvalue; a\u0001=3");
  assert.deepEqual(bad.cookies, [{ name: "good", value: "1" }]);
  assert.equal(bad.skipped.length, 4);
  assert.deepEqual(parseHeaderString("").cookies, []);
  assert.deepEqual(parseHeaderString(null).cookies, []);
});

test("a pasted cookie: like the page's own of that name, else for the whole site, at /, secure on https, kept a year", () => {
  const now = Date.UTC(2026, 10, 3) ;
  // New, on a site's page: its subdomains get it too.
  assert.deepEqual(importDetails({ name: "sid", value: "1" }, "https://www.instagram.com/p/x?y=1", null, now), {
    url: "https://www.instagram.com/", name: "sid", value: "1", domain: ".instagram.com", path: "/", secure: true, httpOnly: false, expirationDate: now / 1000 + IMPORT_LIFETIME,
  });
  assert.equal(importDetails({ name: "a", value: "1" }, "https://shop.example.co.uk/", null, now).domain, ".example.co.uk");
  // An address of its own (an IP, localhost): that host alone, not secure on http.
  for (const url of ["http://127.0.0.1:8080/x", "http://localhost:3000/"]) {
    const details = importDetails({ name: "a", value: "1" }, url, null, now);
    assert.equal(details.domain, undefined, url);
    assert.equal(details.secure, false, url);
  }
  // The page's own cookie of that name: its domain, path, flags and expiry.
  const existing = { name: "sid", value: "old", domain: ".example.com", path: "/app", secure: true, httpOnly: true, hostOnly: false, sameSite: "lax", session: false, expirationDate: 1900000000 };
  assert.deepEqual(importDetails({ name: "sid", value: "new" }, "https://www.example.com/app/", existing, now), {
    url: "https://www.example.com/", name: "sid", value: "new", domain: ".example.com", path: "/app", secure: true, httpOnly: true, sameSite: "lax", expirationDate: 1900000000,
  });
  // A host-only one stays host-only; a session one stays one.
  const hostOnly = importDetails({ name: "s", value: "2" }, "https://www.example.com/", { name: "s", domain: "www.example.com", hostOnly: true, path: "/", session: true, sameSite: "unspecified" }, now);
  assert.equal(hostOnly.domain, undefined);
  assert.equal(hostOnly.expirationDate, undefined);
  assert.equal(hostOnly.sameSite, undefined);
});

test("cookies pasted into a page's session: each set, the refused told apart, written out", async () => {
  const set = [];
  let flushed = 0;
  const session = {
    cookies: {
      get: async ({ url }) => (url.startsWith("https://www.example.com") ? [{ name: "sid", domain: ".example.com", path: "/", secure: true, httpOnly: true, hostOnly: false, session: false, expirationDate: 1900000000 }] : []),
      set: async (details) => {
        if (details.name === "refused") throw new Error("Failed to set cookie");
        set.push(details);
      },
      flushStore: async () => { flushed += 1; },
    },
  };
  const result = await importCookieHeader(session, "https://www.example.com/feed", "Cookie: sid=new; theme=dark; refused=1; bad name=2", Date.UTC(2026, 10, 3));
  assert.equal(result.set, 2);
  assert.deepEqual(result.refused, ["refused"]);
  assert.deepEqual(result.skipped, ["bad name=2"]);
  assert.equal(flushed, 1);
  assert.deepEqual(set.map((d) => [d.name, d.value, d.domain, d.httpOnly]), [["sid", "new", ".example.com", true], ["theme", "dark", ".example.com", false]]);
  // Nothing to set: nothing written.
  const none = await importCookieHeader(session, "https://www.example.com/", "nothing here");
  assert.equal(none.set, 0);
  assert.equal(flushed, 1);
});
