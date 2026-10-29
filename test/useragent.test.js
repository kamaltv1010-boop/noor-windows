"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { acceptLanguages, acceptLanguageHeader, userAgentMetadata, userAgent, brands, parseBrands, formatBrands, chromeVersion } = require("../main/useragent");

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

test("accept languages read as Chrome's for a system language", () => {
  assert.equal(acceptLanguages("en-US"), "en-US,en");
  assert.equal(acceptLanguages("en"), "en-US,en");
  assert.equal(acceptLanguages("en-GB"), "en-GB,en");
  assert.equal(acceptLanguages("fr-FR"), "fr-FR,fr,en-US,en");
  assert.equal(acceptLanguages("fr"), "fr,en-US,en");
  assert.equal(acceptLanguages("ar-MA"), "ar-MA,ar,en-US,en");
  assert.equal(acceptLanguages("pt_BR"), "pt-BR,pt,en-US,en");
  assert.equal(acceptLanguages(""), "en-US,en");
});

test("the Accept-Language header reads as Chrome's", () => {
  assert.equal(acceptLanguageHeader("en-US,en"), "en-US,en;q=0.9");
  assert.equal(acceptLanguageHeader("fr-FR,fr,en-US,en"), "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7");
  assert.equal(acceptLanguageHeader("en-US"), "en-US");
});

test("the override's metadata carries Chrome's brands and the system's details", () => {
  const list = brands("156");
  const metadata = userAgentMetadata({ brandList: list, fullVersionList: list.map((b) => ({ brand: b.brand, version: b.version + ".0.0.0" })), highEntropy: { platformVersion: "19.0.0", architecture: "x86", bitness: "64", wow64: false, model: "", formFactors: ["Desktop"] } });
  assert.equal(metadata.platform, "Windows");
  assert.equal(metadata.platformVersion, "19.0.0");
  assert.equal(metadata.mobile, false);
  assert.deepEqual(metadata.brands.map((b) => b.brand), list.map((b) => b.brand));
  assert.equal(metadata.fullVersionList[0].version.split(".").length, 4);
  const fallback = userAgentMetadata({ brandList: list, fullVersionList: list, highEntropy: null });
  assert.equal(fallback.architecture, "x86");
  assert.deepEqual(fallback.formFactors, ["Desktop"]);
});
