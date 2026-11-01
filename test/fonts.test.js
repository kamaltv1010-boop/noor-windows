"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { isWindowsFont, hiddenFonts, FontList } = require("../main/fonts");

test("Windows' own fonts, their weights and widths, and the supplemental ones", () => {
  for (const name of ["Arial", "arial", "Arial Black", "Segoe UI", "Segoe UI Semibold", "Segoe UI Light", "Calibri Light",
    "Bahnschrift Light Condensed", "Cambria Math", "Franklin Gothic Medium", "Segoe UI Variable Display Semib",
    "Sitka Small Semibold", "Yu Gothic UI Semilight", "Microsoft YaHei UI Light", "Times New Roman Bold Italic",
    "Arabic Typesetting", "Sakkal Majalla", "Arial Nova Light", "Gill Sans Nova Ultra Bold", "MS Mincho", "Cascadia Code"]) {
    assert.ok(isWindowsFont(name), name);
  }
});

test("other programs' fonts aren't Windows'", () => {
  for (const name of ["Arial Narrow", "Arial Rounded MT Bold", "Arial Unicode MS", "Franklin Gothic Book",
    "Franklin Gothic Medium Cond", "Gill Sans MT", "Century Gothic", "Garamond", "Book Antiqua", "Lucida Sans",
    "Lucida Sans Typewriter", "MS Outlook", "MS Reference Sans Serif", "ZWAdobeF", "Myriad Pro", "Wingdings 2",
    "Inter", "JetBrains Mono", "DejaVu Sans", "Liberation Sans", "Roboto", "", "  "]) {
    assert.ok(!isWindowsFont(name), name);
  }
});

test("what pages are kept from finding: families, CSS names and local() names", () => {
  const faces = [
    ["Arial", "Arial", "ArialMT", "Regular"],
    ["Arial", "Arial Narrow", "ArialNarrow", "Regular"],
    ["Segoe UI", "Segoe UI Semibold", "SegoeUI-Semibold", "Semibold"],
    ["Gill Sans MT", "Gill Sans MT", "GillSansMT", "Regular"],
    ["Gill Sans MT", "Gill Sans MT Bold", "GillSansMT-Bold", "Bold"],
    ["Gill Sans MT", "Gill Sans MT Italic", "GillSansMT-Italic", "Italic"],
    ["Gill Sans MT", "Gill Sans MT Condensed", "GillSansMT-Condensed", "Condensed"],
    ["Copperplate Gothic", "Copperplate Gothic Light", "CopperplateGothic-Light", "Light"],
    ["MS Outlook", "MS Outlook", "MSOutlook", "Regular"],
  ];
  const hidden = hiddenFonts(faces);
  assert.deepStrictEqual(hidden.families, ["Copperplate Gothic", "Gill Sans MT", "MS Outlook"]);
  // Asked for in CSS: the families, a face's weight or width named after
  // its family, and Office's Arial Narrow; not Arial, nor Segoe UI.
  assert.deepStrictEqual(hidden.shadow, ["Arial Narrow", "Copperplate Gothic", "Copperplate Gothic Light", "Gill Sans MT", "Gill Sans MT Condensed", "MS Outlook"]);
  for (const name of ["gill sans mt bold", "gillsansmt-italic", "arialnarrow", "arial narrow", "msoutlook", "copperplategothic-light"]) {
    assert.ok(hidden.local.includes(name), name);
  }
  for (const name of ["arial", "arialmt", "segoe ui semibold", "segoeui-semibold"]) {
    assert.ok(!hidden.local.includes(name), name);
  }
});

test("a stock Windows hides nothing", () => {
  const hidden = hiddenFonts([["Arial", "Arial", "ArialMT", "Regular"], ["Segoe UI", "Segoe UI Light", "SegoeUI-Light", "Light"], ["Bahnschrift", "Bahnschrift SemiBold Condensed", "Bahnschrift-SemiBoldCondensed", "SemiBold Condensed"]]);
  assert.deepStrictEqual(hidden, { families: [], shadow: [], local: [] });
  assert.deepStrictEqual(hiddenFonts(null), { families: [], shadow: [], local: [] });
});

test("the font list is kept for the next run, and asked for once a run", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "noor-fonts-"));
  const file = path.join(dir, "fonts.json");
  const first = new FontList(file);
  assert.strictEqual(first.known, false);
  assert.strictEqual(first.hidden(), null);
  let asked = 0;
  const page = { executeJavaScript: async () => { asked++; return [["Inter", "Inter", "Inter-Regular", "Regular"], ["Arial", "Arial", "ArialMT", "Regular"]]; } };
  await first.whenKnown(page);
  await first.refresh(page);
  assert.strictEqual(asked, 1);
  assert.deepStrictEqual(first.hidden().families, ["Inter"]);
  // The next run knows them at once, and asks again meanwhile.
  const next = new FontList(file);
  assert.strictEqual(next.known, true);
  assert.deepStrictEqual(next.hidden().families, ["Inter"]);
  let settled = false;
  const slow = { executeJavaScript: () => new Promise(() => {}) };
  next.whenKnown(slow).then(() => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(settled, true);
});

test("a page that can't answer doesn't hold up the first run for long", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "noor-fonts-"));
  const list = new FontList(path.join(dir, "fonts.json"));
  const started = Date.now();
  await list.refresh({ executeJavaScript: () => new Promise(() => {}) }, 50);
  assert.ok(Date.now() - started < 1000);
  assert.strictEqual(list.known, false);
  const failing = new FontList(path.join(dir, "other.json"));
  await failing.refresh({ executeJavaScript: async () => { throw new Error("Page needs to be visible."); } });
  assert.strictEqual(failing.known, false);
  // Another window shown asks again, a few times at most.
  await failing.refresh({ executeJavaScript: async () => [["Inter", "Inter", "Inter-Regular", "Regular"]] });
  assert.deepStrictEqual(failing.hidden().families, ["Inter"]);
  let more = 0;
  await failing.refresh({ executeJavaScript: async () => { more++; return []; } });
  assert.strictEqual(more, 0);
  const never = new FontList(path.join(dir, "never.json"));
  let tries = 0;
  for (let i = 0; i < 5; i++) await never.refresh({ executeJavaScript: async () => { tries++; throw new Error("no"); } });
  assert.strictEqual(tries, 3);
});
