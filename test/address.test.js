"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { resolve, displayURL, START_URL, ERROR_URL, isStartPage, isAppPage } = require("../main/address");

test("what was typed: addresses, hosts and searches", () => {
  assert.equal(resolve("https://example.com/x"), "https://example.com/x");
  assert.equal(resolve("example.com"), "http://example.com");
  assert.equal(resolve("sub.example.com/path?q=1"), "http://sub.example.com/path?q=1");
  assert.equal(resolve("localhost:3000"), "http://localhost:3000");
  assert.equal(resolve("192.168.1.1/admin"), "http://192.168.1.1/admin");
  assert.equal(resolve("how to cook rice"), "https://www.google.com/search?q=how%20to%20cook%20rice");
  assert.equal(resolve("how to cook rice", "duckduckgo"), "https://duckduckgo.com/?q=how%20to%20cook%20rice");
  assert.equal(resolve("javascript:alert(1)"), "https://www.google.com/search?q=javascript%3Aalert(1)");
  assert.equal(resolve("noor://app/settings.html"), "noor://app/settings.html");
  assert.equal(resolve("   "), null);
  assert.equal(resolve("3.14 pi"), "https://www.google.com/search?q=3.14%20pi");
});

test("what the address bar shows", () => {
  assert.equal(displayURL(START_URL + "?private=1"), "");
  assert.equal(displayURL(ERROR_URL + "?url=" + encodeURIComponent("https://x.com/") + "&code=-105"), "https://x.com/");
  assert.equal(displayURL("https://example.com/"), "https://example.com/");
  assert.equal(isStartPage(START_URL), true);
  assert.equal(isAppPage("noor://app/library.html"), true);
  assert.equal(isAppPage("https://noor"), false);
});
