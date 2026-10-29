"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { build } = require("../tools/build-extension-preload");

test("the extensions' service-worker preload matches the library (rerun tools/build-extension-preload.js after updating it)", () => {
  const written = fs.readFileSync(path.join(__dirname, "..", "scripts", "extension-sw-preload.js"), "utf8");
  assert.equal(written, build());
  assert.ok(written.indexOf('if (!url.startsWith("chrome-extension://"))') < written.indexOf("injectExtensionAPIs"), "the library's code runs only after the check");
});
