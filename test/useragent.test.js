"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { userAgent, brands, parseBrands, formatBrands, chromeVersion } = require("../main/useragent");

test("the user agent is Chrome on Windows, without Electron", () => {
  const agent = userAgent();
  assert.match(agent, /^Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/);
  assert.doesNotMatch(agent, /Electron|noor/i);
});

test("brands: Not A Brand, Chromium and Google Chrome, in a fixed order per version", () => {
  const list = brands("146");
  assert.equal(list.length, 3);
  assert.deepEqual(list.map((b) => b.brand).sort(), ["Chromium", "Google Chrome", "Not-A.Brand"]);
  assert.ok(list.every((b) => b.version === "146" || b.version === "24"));
  assert.deepEqual(brands("146"), list);
  const greasey = { brand: "Not)A;Brand", version: "8" };
  assert.ok(brands("146", greasey).some((b) => b.brand === "Not)A;Brand" && b.version === "8"));
});

test("Sec-CH-UA parsing and formatting", () => {
  const header = '"Chromium";v="146", "Not-A.Brand";v="24"';
  const parsed = parseBrands(header);
  assert.deepEqual(parsed, [{ brand: "Chromium", version: "146" }, { brand: "Not-A.Brand", version: "24" }]);
  assert.equal(formatBrands(parsed), header);
  assert.deepEqual(parseBrands(""), []);
  assert.match(chromeVersion(), /^\d+$/);
});
