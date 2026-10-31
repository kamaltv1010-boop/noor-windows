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
