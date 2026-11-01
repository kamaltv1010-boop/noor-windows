// Draws Noor iPhone's and Noor Android's logos from their SVG
// (build/icon-iphone.svg, build/icon-android.svg) at every size Windows
// shows an icon at, each drawn at its own size (crisp, not one picture
// scaled down), and keeps them as a 256 px PNG and a .ico holding every
// size (as PNGs, which Windows reads since Vista). Noor's own logo
// (build/icon.ico, purple, a shield) is left as it is: each of the three
// apps has its own, told apart by its color and its shape.
// Needs Playwright and its Chromium: `node tools/make-icons.js`.
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const build = path.join(__dirname, "..", "build");
const SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

/// A .ico file holding these PNGs (each an image of its own size).
const ico = (pngs) => {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, at);
    head.writeUInt8(size >= 256 ? 0 : size, at + 1);
    head.writeUInt8(0, at + 2);
    head.writeUInt8(0, at + 3);
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(data.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
};

(async () => {
  const browser = await chromium.launch();
  for (const name of ["iphone", "android"]) {
    const svg = fs.readFileSync(path.join(build, `icon-${name}.svg`), "utf8");
    const pngs = [];
    for (const size of SIZES) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
      const data = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
      pngs.push({ size, data });
      await page.close();
    }
    fs.writeFileSync(path.join(build, `icon-${name}.png`), pngs.find((p) => p.size === 256).data);
    fs.writeFileSync(path.join(build, `icon-${name}.ico`), ico(pngs));
    console.log(`build/icon-${name}.ico: ${SIZES.join(", ")} px; build/icon-${name}.png: 256 px`);
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
