"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { chromeOrder, MEDIA_ACCEPT_ENCODING } = require("../main/headers");

// The headers of requests as Electron hands them over, and in the order
// Chrome sent the same requests (read from Chrome's requests to a test
// site; Host, Connection and Content-Length come later, in both).
const headersOf = (names) => Object.fromEntries(names.map((name) => [name, `v:${name}`]));
const order = (names, type) => Object.keys(chromeOrder(headersOf(names), type));

const SF = ["Sec-Fetch-Site", "Sec-Fetch-Mode", "Sec-Fetch-Dest"];

test("a page's request (a style sheet): Accept-Language after the platform, the user agent after sec-ch-ua", () => {
  assert.deepStrictEqual(
    order(["sec-ch-ua-platform", "User-Agent", "sec-ch-ua", "sec-ch-ua-mobile", "Accept", ...SF, "Referer", "Accept-Encoding", "Accept-Language"], "stylesheet"),
    ["sec-ch-ua-platform", "Accept-Language", "sec-ch-ua", "User-Agent", "sec-ch-ua-mobile", "Accept", ...SF, "Referer", "Accept-Encoding"],
  );
});

test("a request with a body: the user agent after sec-ch-ua-mobile", () => {
  assert.deepStrictEqual(
    order(["sec-ch-ua-platform", "User-Agent", "sec-ch-ua", "Content-Type", "sec-ch-ua-mobile", "Accept", "Origin", ...SF, "Referer", "Accept-Encoding", "Accept-Language"], "xhr"),
    ["sec-ch-ua-platform", "Accept-Language", "sec-ch-ua", "Content-Type", "sec-ch-ua-mobile", "User-Agent", "Accept", "Origin", ...SF, "Referer", "Accept-Encoding"],
  );
});

test("a page's own headers stay ahead, and so do Pragma and Cache-Control", () => {
  assert.deepStrictEqual(
    order(["X-Test", "sec-ch-ua-platform", "User-Agent", "sec-ch-ua", "sec-ch-ua-mobile", "Accept", ...SF, "Referer", "Accept-Encoding", "Accept-Language"], "xhr"),
    ["X-Test", "sec-ch-ua-platform", "Accept-Language", "sec-ch-ua", "User-Agent", "sec-ch-ua-mobile", "Accept", ...SF, "Referer", "Accept-Encoding"],
  );
  assert.deepStrictEqual(
    order(["Pragma", "Cache-Control", "sec-ch-ua-platform", "User-Agent", "sec-ch-ua", "sec-ch-ua-mobile", "Accept", ...SF, "Referer", "Accept-Encoding", "Accept-Language"], "xhr"),
    ["Pragma", "Cache-Control", "sec-ch-ua-platform", "Accept-Language", "sec-ch-ua", "User-Agent", "sec-ch-ua-mobile", "Accept", ...SF, "Referer", "Accept-Encoding"],
  );
});

test("a video's part: Accept-Encoding (Chrome's) and Accept-Language after the platform", () => {
  const headers = headersOf(["sec-ch-ua-platform", "User-Agent", "sec-ch-ua", "sec-ch-ua-mobile", "Accept", "Sec-Fetch-Site", "Sec-Fetch-Mode", "Sec-Fetch-Dest", "Referer", "Accept-Encoding", "Accept-Language", "Range"]);
  headers["Sec-Fetch-Dest"] = "video";
  headers["Accept-Encoding"] = "identity";
  const out = chromeOrder(headers, "media");
  assert.deepStrictEqual(Object.keys(out), ["sec-ch-ua-platform", "Accept-Encoding", "Accept-Language", "sec-ch-ua", "User-Agent", "sec-ch-ua-mobile", "Accept", ...SF, "Referer", "Range"]);
  assert.strictEqual(out["Accept-Encoding"], MEDIA_ACCEPT_ENCODING);
});

test("a page and a frame's page: Accept-Language after the hints", () => {
  assert.deepStrictEqual(
    order(["sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform", "Upgrade-Insecure-Requests", "User-Agent", "Accept", "Sec-Fetch-Site", "Sec-Fetch-Mode", "Sec-Fetch-User", "Sec-Fetch-Dest", "Accept-Encoding", "Accept-Language"], "mainFrame"),
    ["sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform", "Accept-Language", "Upgrade-Insecure-Requests", "User-Agent", "Accept", "Sec-Fetch-Site", "Sec-Fetch-Mode", "Sec-Fetch-User", "Sec-Fetch-Dest", "Accept-Encoding"],
  );
  assert.deepStrictEqual(
    order(["Cache-Control", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform", "Upgrade-Insecure-Requests", "Content-Type", "User-Agent", "Origin", "Accept", ...SF, "Referer", "Accept-Encoding", "Accept-Language"], "subFrame"),
    ["Cache-Control", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform", "Accept-Language", "Upgrade-Insecure-Requests", "Content-Type", "User-Agent", "Origin", "Accept", ...SF, "Referer", "Accept-Encoding"],
  );
});

test("a worker's script: the user agent after Referer, Accept-Language last", () => {
  const headers = headersOf(["Accept", "User-Agent", ...SF, "Referer", "Accept-Encoding", "Accept-Language"]);
  headers["Sec-Fetch-Dest"] = "worker";
  assert.deepStrictEqual(Object.keys(chromeOrder(headers, "script")), ["Accept", ...SF, "Referer", "User-Agent", "Accept-Encoding", "Accept-Language"]);
});

test("an http:// site (no hints): Accept-Language before the user agent, or before Upgrade-Insecure-Requests", () => {
  assert.deepStrictEqual(
    order(["User-Agent", "Accept", "Referer", "Accept-Encoding", "Accept-Language"], "image"),
    ["Accept-Language", "User-Agent", "Accept", "Referer", "Accept-Encoding"],
  );
  assert.deepStrictEqual(
    order(["User-Agent", "X-Test", "Accept", "Referer", "Accept-Encoding", "Accept-Language"], "xhr"),
    ["Accept-Language", "User-Agent", "X-Test", "Accept", "Referer", "Accept-Encoding"],
  );
  assert.deepStrictEqual(
    order(["User-Agent", "Content-Type", "Accept", "Origin", "Referer", "Accept-Encoding", "Accept-Language"], "xhr"),
    ["Accept-Language", "User-Agent", "Content-Type", "Accept", "Origin", "Referer", "Accept-Encoding"],
  );
  assert.deepStrictEqual(
    order(["Cache-Control", "Upgrade-Insecure-Requests", "Content-Type", "User-Agent", "Origin", "Accept", "Referer", "Accept-Encoding", "Accept-Language"], "subFrame"),
    ["Cache-Control", "Accept-Language", "Upgrade-Insecure-Requests", "Content-Type", "User-Agent", "Origin", "Accept", "Referer", "Accept-Encoding"],
  );
  // A worker's script on an http:// site has no Sec-Fetch headers either;
  // its user agent after Accept tells it from a page's request.
  assert.deepStrictEqual(
    order(["Accept", "User-Agent", "Referer", "Accept-Encoding", "Accept-Language"], "script"),
    ["Accept", "Referer", "User-Agent", "Accept-Encoding", "Accept-Language"],
  );
});

test("headers without what is moved stay as they are, values too", () => {
  const headers = { Accept: "*/*", "X-A": "1" };
  assert.deepStrictEqual(chromeOrder(headers, "xhr"), headers);
  const out = chromeOrder({ "sec-ch-ua-platform": "\"Windows\"", "User-Agent": "UA", "sec-ch-ua": "B", "sec-ch-ua-mobile": "?0", "Accept-Language": "fr-FR,fr;q=0.9" }, "image");
  assert.strictEqual(out["Accept-Language"], "fr-FR,fr;q=0.9");
  assert.strictEqual(out["User-Agent"], "UA");
});
