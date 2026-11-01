"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mobile = require("../main/mobile");

/// The images a .ico file holds: [{ width, height }] (0 in the file is 256).
const icoImages = (file) => {
  const data = fs.readFileSync(file);
  assert.equal(data.readUInt16LE(0), 0, `${file}: not an icon file`);
  assert.equal(data.readUInt16LE(2), 1, `${file}: not an icon file`);
  const count = data.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => ({ width: data.readUInt8(6 + 16 * i) || 256, height: data.readUInt8(7 + 16 * i) || 256 }));
};

test("each of the three apps has a logo of its own, a .ico with a 256 px image", () => {
  const files = ["windows", "iphone", "android"].map((build) => mobile.iconPath(build));
  for (const file of files) {
    assert.ok(fs.existsSync(file), `${file} is missing`);
    assert.ok(icoImages(file).some((image) => image.width === 256 && image.height === 256), `${file} has no 256 px image (the installer needs one)`);
  }
  const hashes = files.map((file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"));
  assert.equal(new Set(hashes).size, 3, "two apps share a logo");
  // Noor iPhone's and Noor Android's are drawn at every size Windows shows.
  for (const file of files.slice(1)) {
    assert.deepEqual(icoImages(file).map((image) => image.width), [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]);
  }
});

test("each build gives its .exe, installer and shortcuts its own logo", () => {
  const root = path.join(__dirname, "..");
  assert.equal(require("../package.json").build.win.icon, "build/icon.ico");
  assert.match(fs.readFileSync(path.join(root, "tools", "build-iphone.js"), "utf8"), /icon: "build\/icon-iphone\.ico"/);
  assert.match(fs.readFileSync(path.join(root, "tools", "build-android.js"), "utf8"), /icon: "build\/icon-android\.ico"/);
  // The app takes its logos along (its windows and the taskbar use them).
  assert.ok(require("../package.json").build.files.includes("build/icon*"));
});
