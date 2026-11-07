"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { NewProfileCookies, parseCookies, siteAddress, seedDetails, MAX_TEXT } = require("../main/new-cookies");
const { netscape, asJSON, IMPORT_LIFETIME } = require("../main/cookies");

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "noor-new-cookies-")), "new-profile-cookies.json");

/// The system's encryption, as the tests have it: reversible, and the
/// values nowhere in what it gives.
const sealer = {
  available: () => true,
  seal: (text) => Buffer.from(text).toString("base64").split("").reverse().join(""),
  open: (sealed) => Buffer.from(String(sealed).split("").reverse().join(""), "base64").toString(),
};

test("the site's field: an address as a person writes it, https when no scheme is written", () => {
  assert.equal(siteAddress("instagram.com").href, "https://instagram.com/");
  assert.equal(siteAddress(" https://www.instagram.com/accounts/login ").hostname, "www.instagram.com");
  const local = siteAddress("http://www.win.test:8080/x");
  assert.equal(local.protocol, "http:");
  assert.equal(local.hostname, "www.win.test");
  for (const nothing of ["", "   ", "not a site!", "ftp://example.com", "javascript:alert(1)", "https://"]) {
    assert.equal(siteAddress(nothing), null, nothing);
  }
});

test("a Cookie header's text, for the site written: the whole site's, at /, secure on https; __Host- and __Secure- as Chromium wants them", () => {
  const url = siteAddress("https://www.instagram.com/accounts/");
  const parsed = parseCookies("Cookie: sessionid=abc; csrftoken=x y; no pair here; __Host-t=1; __Secure-s=2; sessionid=last", url);
  assert.equal(parsed.format, "header");
  assert.deepEqual(parsed.skipped, ["no pair here"]);
  const byName = Object.fromEntries(parsed.cookies.map((c) => [c.name, c]));
  assert.deepEqual(Object.keys(byName), ["csrftoken", "__Host-t", "__Secure-s", "sessionid"]);
  assert.deepEqual(byName.sessionid, { name: "sessionid", value: "last", domain: ".instagram.com", hostOnly: false, path: "/", secure: true, httpOnly: false, sameSite: "unspecified" });
  assert.equal(byName.csrftoken.value, "x y");
  assert.deepEqual(byName["__Host-t"], { name: "__Host-t", value: "1", domain: "www.instagram.com", hostOnly: true, path: "/", secure: true, httpOnly: false, sameSite: "unspecified" });
  assert.equal(byName["__Secure-s"].secure, true);
  // On http: not secure. An address of its own: that host alone.
  assert.equal(parseCookies("a=1", siteAddress("http://shop.example.co.uk/")).cookies[0].domain, ".example.co.uk");
  assert.equal(parseCookies("a=1", siteAddress("http://shop.example.co.uk/")).cookies[0].secure, false);
  assert.deepEqual(parseCookies("a=1", siteAddress("http://127.0.0.1:8080/")).cookies[0].domain, "127.0.0.1");
  assert.equal(parseCookies("a=1", siteAddress("http://localhost:3000/")).cookies[0].hostOnly, true);
  // With no site, they can't be kept: it is asked for.
  const siteless = parseCookies("a=1; b=2");
  assert.equal(siteless.needsSite, true);
  assert.deepEqual(siteless.cookies, []);
});

test("a cookies.txt file (as Noor, curl and the extensions write it) and Noor's JSON give back the cookies they were made of", () => {
  const electronCookies = [
    { name: "a", value: "1", domain: ".win.test", hostOnly: false, path: "/", secure: false, httpOnly: false, session: false, expirationDate: 1900000000, sameSite: "unspecified" },
    { name: "b", value: "two", domain: "www.win.test", hostOnly: true, path: "/app", secure: true, httpOnly: true, session: true, sameSite: "lax" },
  ];
  const expected = [
    { name: "a", value: "1", domain: ".win.test", hostOnly: false, path: "/", secure: false, httpOnly: false, sameSite: "unspecified" },
    { name: "b", value: "two", domain: "www.win.test", hostOnly: true, path: "/app", secure: true, httpOnly: true, sameSite: "unspecified" },
  ];
  const txt = parseCookies(netscape(electronCookies));
  assert.equal(txt.format, "txt");
  assert.deepEqual(txt.cookies, expected);
  assert.deepEqual(txt.skipped, []);
  const json = parseCookies(asJSON(electronCookies));
  assert.equal(json.format, "json");
  assert.deepEqual(json.cookies, [expected[0], { ...expected[1], sameSite: "lax" }]);
  // curl's own, with a line that is no cookie.
  const curl = parseCookies("# Netscape HTTP Cookie File\nexample.com\tFALSE\t/\tTRUE\t0\tsid\tv w\n.example.com\tTRUE\t/\tFALSE\t1900000000\tlang\tar\nnot a cookie line\n");
  assert.deepEqual(curl.cookies.map((c) => [c.name, c.value, c.domain, c.hostOnly, c.secure]), [["sid", "v w", "example.com", true, true], ["lang", "ar", ".example.com", false, false]]);
  assert.deepEqual(curl.skipped, ["not a cookie line"]);
});

test("JSON of other browsers' and extensions' exports: Cookie-Editor's, Playwright's, with or without a domain", () => {
  const editor = parseCookies(JSON.stringify([
    { domain: ".instagram.com", expirationDate: 1790000000, hostOnly: false, httpOnly: true, name: "sessionid", path: "/", sameSite: "no_restriction", secure: true, session: false, storeId: "0", value: "abc" },
    { domain: "www.instagram.com", hostOnly: true, name: "ig_nrcb", path: "/", sameSite: null, secure: false, value: "1" },
    { domain: ".instagram.com", name: "bad;name", value: "x" },
    "not a cookie",
  ]));
  assert.equal(editor.format, "json");
  assert.deepEqual(editor.cookies, [
    { name: "sessionid", value: "abc", domain: ".instagram.com", hostOnly: false, path: "/", secure: true, httpOnly: true, sameSite: "no_restriction" },
    { name: "ig_nrcb", value: "1", domain: "www.instagram.com", hostOnly: true, path: "/", secure: false, httpOnly: false, sameSite: "unspecified" },
  ]);
  assert.equal(editor.skipped.length, 2);
  // Playwright's storage state: a domain with no dot before it is that host's alone; SameSite=None only on a secure one.
  const playwright = parseCookies(JSON.stringify({ cookies: [
    { name: "x", value: "1", domain: "example.com", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" },
    { name: "y", value: "2", domain: ".example.com", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "None" },
  ], origins: [] }));
  assert.deepEqual(playwright.cookies.map((c) => [c.name, c.domain, c.hostOnly, c.sameSite]), [["x", "example.com", true, "lax"], ["y", ".example.com", false, "unspecified"]]);
  // No domain: the site written's, or no cookie.
  assert.deepEqual(parseCookies('[{"name":"n","value":"v"}]', siteAddress("example.org")).cookies.map((c) => c.domain), [".example.org"]);
  assert.deepEqual(parseCookies('[{"name":"n","value":"v"}]').cookies, []);
  assert.match(parseCookies("[{\"name\": ").error, /JSON/);
});

test("kept by site, sealed by the system, read back at the next launch; one of the same name replaced; removed; turned off", () => {
  const file = tempFile();
  const seeds = new NewProfileCookies(file, { sealer });
  assert.equal(seeds.active(), false);
  assert.deepEqual(seeds.state(), { enabled: true, sealed: false, total: 0, sites: [] });
  const added = seeds.add("instagram.com", "sessionid=SECRET1; csrftoken=SECRET3");
  assert.deepEqual({ added: added.added, sites: added.sites, format: added.format }, { added: 2, sites: ["instagram.com"], format: "header" });
  const more = seeds.add("", JSON.stringify([{ domain: ".example.com", name: "j", value: "SECRET2", path: "/" }, { domain: "www.instagram.com", hostOnly: false, name: "ds_user_id", value: "7" }]));
  assert.deepEqual(more.sites, ["example.com", "instagram.com"]);
  assert.equal(seeds.active(), true);
  const state = seeds.state();
  assert.equal(state.enabled, true);
  assert.equal(state.sealed, true);
  assert.equal(state.total, 4);
  assert.deepEqual(state.sites.map((s) => [s.site, s.count, s.names, s.unreadable]), [
    ["example.com", 1, ["j"], false],
    ["instagram.com", 3, ["csrftoken", "ds_user_id", "sessionid"], false],
  ]);
  // The file holds no value, and isn't settings.json.
  const written = fs.readFileSync(file, "utf8");
  for (const value of ["SECRET1", "SECRET2", "SECRET3"]) {
    assert.ok(!written.includes(value), value);
  }
  // The next launch reads them back.
  const again = new NewProfileCookies(file, { sealer });
  assert.deepEqual(again.state(), state);
  assert.deepEqual(again.cookies().map((c) => `${c.name}=${c.value}`), ["j=SECRET2", "sessionid=SECRET1", "csrftoken=SECRET3", "ds_user_id=7"]);
  // One of the same name, domain and path: the new one.
  again.add("https://www.instagram.com/", "sessionid=NEW");
  assert.equal(again.cookies().filter((c) => c.name === "sessionid").map((c) => c.value).join(), "NEW");
  assert.equal(again.state().total, 4);
  // Removed; turned off (the list stays).
  again.remove(again.state().sites.find((s) => s.site === "example.com").id);
  assert.deepEqual(again.state().sites.map((s) => s.site), ["instagram.com"]);
  again.setEnabled(false);
  assert.equal(again.active(), false);
  const third = new NewProfileCookies(file, { sealer });
  assert.equal(third.state().enabled, false);
  assert.equal(third.state().total, 3);
  // Sealed by another computer: can't be read, and isn't put in.
  const elsewhere = new NewProfileCookies(file, { sealer: { ...sealer, open: () => { throw new Error("not this user's"); } } });
  elsewhere.setEnabled(true);
  assert.equal(elsewhere.state().sites[0].unreadable, true);
  assert.equal(elsewhere.state().total, 0);
  assert.equal(elsewhere.active(), false);
  assert.deepEqual(elsewhere.cookies(), []);
});

test("with no system encryption they are kept as they are, and sealed once it can", () => {
  const file = tempFile();
  let can = false;
  const later = { ...sealer, available: () => can };
  const seeds = new NewProfileCookies(file, { sealer: later });
  seeds.add("example.com", "a=VISIBLE");
  assert.equal(seeds.state().sealed, false);
  assert.ok(fs.readFileSync(file, "utf8").includes("VISIBLE"));
  can = true;
  seeds.setEnabled(true);
  assert.equal(seeds.state().sealed, true);
  assert.ok(!fs.readFileSync(file, "utf8").includes("VISIBLE"));
  assert.equal(new NewProfileCookies(file, { sealer: later }).cookies()[0].value, "VISIBLE");
});

test("what is no cookie, or too much, is said, and nothing changes", () => {
  const seeds = new NewProfileCookies(null);
  assert.match(seeds.add("", "a=1; b=2").error, /Write the site/);
  assert.match(seeds.add("not a site!", "a=1").error, /isn't a site's address/);
  assert.match(seeds.add("example.com", "").error, /No cookies/);
  assert.match(seeds.add("example.com", "no pair; another").error, /No cookie in that text could be kept/);
  assert.match(seeds.add("example.com", "[1, 2").error, /JSON/);
  assert.match(seeds.add("example.com", "a=" + "x".repeat(MAX_TEXT)).error, /too long/);
  const many = Array.from({ length: 5001 }, (_, i) => ({ domain: ".example.com", name: `c${i}`, value: "1" }));
  assert.match(seeds.add("", JSON.stringify(many)).error, /too many/);
  assert.deepEqual(seeds.state().sites, []);
});

test("put into each new profile's session as kept, each a year from then, and written out; off, none", async () => {
  const sets = {};
  const flushed = [];
  const sessionFor = (profile) => ({
    cookies: {
      set: async (details) => {
        if (details.name === "refused") {
          throw new Error("Failed to set cookie");
        }
        (sets[profile.id] = sets[profile.id] || []).push(details);
      },
      flushStore: async () => { flushed.push(profile.id); },
    },
  });
  const seeds = new NewProfileCookies(null, { sessionFor });
  seeds.add("https://www.instagram.com/", "sessionid=abc; __Host-h=1; refused=1");
  seeds.add("", JSON.stringify([{ domain: ".example.com", name: "j", value: "v", httpOnly: true, secure: true, sameSite: "lax", path: "/x" }]));
  const now = 1700000000000;
  const done = await seeds.seed([{ id: "p1" }, { id: "p2" }], now);
  assert.deepEqual(done, { set: 6, refused: 2 });
  const year = now / 1000 + IMPORT_LIFETIME;
  assert.deepEqual(sets.p1, [
    { url: "https://example.com/x", name: "j", value: "v", path: "/x", secure: true, httpOnly: true, expirationDate: year, domain: ".example.com", sameSite: "lax" },
    { url: "https://instagram.com/", name: "sessionid", value: "abc", path: "/", secure: true, httpOnly: false, expirationDate: year, domain: ".instagram.com" },
    { url: "https://www.instagram.com/", name: "__Host-h", value: "1", path: "/", secure: true, httpOnly: false, expirationDate: year },
  ]);
  assert.deepEqual(sets.p2, sets.p1);
  assert.deepEqual(flushed.sort(), ["p1", "p2"]);
  assert.deepEqual(seedDetails({ name: "a", value: "1", domain: "127.0.0.1", hostOnly: true, path: "/", secure: false, httpOnly: false, sameSite: "unspecified" }, now), {
    url: "http://127.0.0.1/", name: "a", value: "1", path: "/", secure: false, httpOnly: false, expirationDate: year,
  });
  seeds.setEnabled(false);
  assert.deepEqual(await seeds.seed([{ id: "p3" }], now), { set: 0, refused: 0 });
  assert.equal(sets.p3, undefined);
});
