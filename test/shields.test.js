"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { Shields, Stats } = require("../main/shields");
const { tempStore } = require("./helpers");

const rules = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "rules", "trackers.json"), "utf8"));

test("tracker rules: third-party files from tracker domains, unless the page is a site the rule allows", () => {
  const shields = new Shields(tempStore(), rules);
  assert.equal(shields.isTracker("https://connect.facebook.net/en_US/sdk.js", "https://example.com/page"), true);
  assert.equal(shields.isTracker("https://connect.facebook.net/en_US/sdk.js", "https://www.instagram.com/"), false);
  assert.equal(shields.isTracker("https://www.facebook.com/tr?id=1", "https://www.facebook.com/"), false);
  assert.equal(shields.isTracker("https://www.google-analytics.com/analytics.js", "https://example.com/"), true);
  assert.equal(shields.isTracker("https://example.com/analytics.js", "https://example.com/"), false);
  assert.equal(shields.isTracker("not a url", "https://example.com/"), false);
});

test("shields down for a site, and back up", () => {
  const shields = new Shields(tempStore(), rules);
  assert.equal(shields.areUp("https://www.example.com/x"), true);
  shields.setUp(false, Shields.site("https://www.example.com/x"));
  assert.deepEqual(shields.downSites(), ["example.com"]);
  assert.equal(shields.areUp("https://example.com/"), false);
  assert.equal(shields.areUp("https://sub.example.com/"), true);
  shields.setUp(true, "example.com");
  assert.deepEqual(shields.downSites(), []);
});

test("sign-in sites", () => {
  assert.equal(Shields.isSignInSite("https://www.instagram.com/accounts/emailsignup/"), true);
  assert.equal(Shields.isSignInSite("https://accounts.google.com/signin"), true);
  assert.equal(Shields.isSignInSite("https://www.google.com/"), false);
  assert.equal(Shields.isSignInSite("https://example.com/"), false);
});

test("HTTPS upgrade: plain sites only, not ports, local names, addresses or sites that failed over https", () => {
  const shields = new Shields(tempStore(), rules);
  assert.equal(shields.upgraded("http://example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(shields.upgraded("https://example.com/"), null);
  assert.equal(shields.upgraded("http://example.com:8080/"), null);
  assert.equal(shields.upgraded("http://localhost/"), null);
  assert.equal(shields.upgraded("http://printer.local/"), null);
  assert.equal(shields.upgraded("http://192.168.1.1/"), null);
  shields.httpOnlyHosts.add("example.com");
  assert.equal(shields.upgraded("http://example.com/"), null);
});

test("clean links: tracking codes go, the rest stays", () => {
  const shields = new Shields(tempStore(), rules);
  assert.equal(shields.clean("https://a.com/p?utm_source=x&id=1&fbclid=abc"), "https://a.com/p?id=1");
  assert.equal(shields.clean("https://a.com/p?gclid=1"), "https://a.com/p");
  assert.equal(shields.clean("https://a.com/p?id=1"), null);
  assert.equal(shields.clean("https://a.com/p"), null);
  assert.equal(shields.clean("https://a.com/p?q=a%20b&UTM_Medium=m#frag"), "https://a.com/p?q=a%20b#frag");
});

test("flags default to on", () => {
  const store = tempStore();
  const shields = new Shields(store, rules);
  assert.equal(shields.trackersEnabled(), true);
  assert.equal(shields.httpsEnabled(), true);
  assert.equal(shields.cleanLinksEnabled(), true);
  store.set("blockTrackers", false);
  assert.equal(shields.trackersEnabled(), false);
});

test("stats count and reset", () => {
  const stats = new Stats(tempStore());
  stats.trackerBlocked();
  stats.trackerBlocked();
  stats.connectionUpgraded();
  assert.deepEqual(stats.toJSON(), { trackersBlocked: 2, httpsUpgrades: 1, timeSaved: 100 });
  stats.reset();
  assert.equal(stats.trackersBlocked, 0);
});
