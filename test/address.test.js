"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { resolve, displayURL, START_URL, ERROR_URL, isStartPage, isAppPage, isLocalAddress, isLocalIP, hostIsName } = require("../main/address");

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

test("this computer and its own network, by an address or what a name resolves to", () => {
  // Written in the address.
  for (const url of ["http://localhost:3000/", "http://app.localhost/", "http://127.0.0.1/", "http://10.0.0.5/", "http://172.16.0.1/", "http://172.31.255.1/", "http://192.168.1.1/", "http://169.254.169.254/", "http://0.0.0.0:8080/", "http://[::1]/", "http://[fd00::1]/", "http://[fe80::1]/"]) {
    assert.equal(isLocalAddress(url), true, url);
  }
  for (const url of ["http://172.32.0.1/", "http://8.8.8.8/", "https://example.com/", "http://127.0.0.1.nip.io/", "http://[2001:4860::8888]/", "not a url"]) {
    assert.equal(isLocalAddress(url), false, url);
  }
  // As a resolver gives them, IPv4 written in IPv6 (::ffff:) included.
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.0.10", "169.254.1.1", "0.0.0.0", "::1", "::", "fd12::1", "fe80::1%eth0", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:ac10:1", "::ffff:c0a8:101", "[::1]"]) {
    assert.equal(isLocalIP(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2001:4860::8888", "::ffff:808:808", "::ffff:8.8.8.8", "", null]) {
    assert.equal(isLocalIP(ip), false, String(ip));
  }
  // Only a name tells its place by resolving.
  assert.equal(hostIsName("http://127.0.0.1.nip.io:9222/json"), true);
  assert.equal(hostIsName("https://example.com/"), true);
  assert.equal(hostIsName("http://192.168.1.1/"), false);
  assert.equal(hostIsName("http://[::1]:80/"), false);
  assert.equal(hostIsName("nonsense"), false);
});
