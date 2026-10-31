"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { iconLook, icoFile, profileAppId, PALETTE, ICON_SIZES, drawProfileIcons } = require("../main/profile-icon");

test("a profile's icon: its name on two lines, a numbered name's number big below, a short form for small sizes", () => {
  assert.deepEqual(iconLook("Profile 6").lines, ["Profile", "6"]);
  assert.equal(iconLook("Profile 6").short, "6");
  assert.deepEqual(iconLook("Farm 12").lines, ["Farm", "12"]);
  assert.deepEqual(iconLook("Insta-3").lines, ["Insta", "3"]);
  assert.deepEqual(iconLook("Shop #4").lines, ["Shop", "4"]);
  assert.deepEqual(iconLook("Quick full-habit").lines, ["Quick", "full-ha"]);
  assert.equal(iconLook("Quick full-habit").short, "QF");
  assert.deepEqual(iconLook("Work").lines, ["Work"]);
  assert.equal(iconLook("Work").short, "WO");
  assert.deepEqual(iconLook("Marketplace").lines, ["Market", "place"]);
  assert.deepEqual(iconLook("42").lines, ["42"]);
  assert.deepEqual(iconLook("A very long profile name 7").lines, ["A very l", "7"]);
  assert.deepEqual(iconLook("").lines, ["Profile"]);
  assert.deepEqual(iconLook(null).lines, ["Profile"]);
  // Letters of any language, and whole characters.
  assert.deepEqual(iconLook("حساب 3").lines, ["حساب", "3"]);
  assert.equal(iconLook("😀😀😀😀😀😀😀😀").lines[0], "😀😀😀😀😀😀");
});

test("the same name, the same colors; names apart, mostly other colors", () => {
  assert.deepEqual(iconLook("Profile 6").colors, iconLook(" profile  6 ").colors);
  assert.ok(PALETTE.some((pair) => pair === iconLook("Profile 6").colors));
  const colors = new Set(Array.from({ length: 12 }, (_, i) => iconLook(`Profile ${i + 1}`).colors[0]));
  assert.ok(colors.size >= 6, `${colors.size} colors for 12 profiles`);
});

test("an .ico file of PNGs, as Windows reads them: sizes, offsets, 256 as 0", () => {
  const png = (n) => Buffer.from(Array.from({ length: n }, (_, i) => i % 256));
  const ico = icoFile([{ size: 256, png: png(300) }, { size: 16, png: png(40) }, { size: 32, png: png(70) }]);
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  const entry = (i) => ({ width: ico.readUInt8(6 + i * 16), height: ico.readUInt8(7 + i * 16), planes: ico.readUInt16LE(10 + i * 16), bits: ico.readUInt16LE(12 + i * 16), length: ico.readUInt32LE(14 + i * 16), offset: ico.readUInt32LE(18 + i * 16) });
  assert.deepEqual([0, 1, 2].map((i) => entry(i).width), [16, 32, 0]);
  assert.deepEqual([0, 1, 2].map((i) => entry(i).height), [16, 32, 0]);
  assert.ok([0, 1, 2].every((i) => entry(i).planes === 1 && entry(i).bits === 32));
  assert.equal(entry(0).offset, 6 + 3 * 16);
  assert.equal(entry(1).offset, entry(0).offset + 40);
  assert.equal(entry(2).offset, entry(1).offset + 70);
  assert.equal(ico.length, entry(2).offset + 300);
  assert.deepEqual(ico.subarray(entry(1).offset, entry(1).offset + 70), png(70));
});

test("each profile's windows are a taskbar button of their own: an App User Model ID of their own", () => {
  assert.equal(profileAppId("ma.noor.browser", { id: "0f8e7c6a-1b2c-4d5e-8f90-a1b2c3d4e5f6" }), "ma.noor.browser.profile.0f8e7c6a1b2c4d5e8f90a1b2c3d4e5f6");
  assert.notEqual(profileAppId("ma.noor.browser", { id: "a" }), profileAppId("ma.noor.browser", { id: "b" }));
  assert.ok(profileAppId("ma.noor.iphone", { id: "x y/z" }).length < 128);
  assert.ok(!/[\s/]/.test(profileAppId("ma.noor.iphone", { id: "x y/z" })));
});

test("what is drawn in the page is a function of its own", () => {
  assert.equal(typeof drawProfileIcons, "function");
  // It is sent as its source: it must stand alone.
  new Function(`return (${drawProfileIcons.toString()})`)();
  assert.ok(ICON_SIZES.includes(16) && ICON_SIZES.includes(32) && ICON_SIZES.includes(256));
});
