"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const AdmZip = require("adm-zip");
const crx = require("../main/crx");
const { zipOf, newKey, crx3, crx2 } = require("../tools/make-crx");

const SAMPLE = path.join(__dirname, "..", "tools", "sample-extension");

test("store pages give their extension's ID", () => {
  const id = "ddkjiahejlhfcafbddmgiahcphecmpfh";
  assert.equal(crx.storeExtensionID(`https://chromewebstore.google.com/detail/ublock-origin-lite/${id}`), id);
  assert.equal(crx.storeExtensionID(`https://chromewebstore.google.com/detail/${id}?hl=fr`), id);
  assert.equal(crx.storeExtensionID(`https://chrome.google.com/webstore/detail/name/${id}`), id);
  assert.equal(crx.storeExtensionID("https://chromewebstore.google.com/"), null);
  assert.equal(crx.storeExtensionID(`https://example.com/detail/name/${id}`), null);
  assert.equal(crx.storeExtensionID(`http://chromewebstore.google.com/detail/name/${id}`), null);
  assert.equal(crx.storeExtensionID("not a url"), null);
  assert.equal(crx.storeTitle("uBlock Origin Lite - Chrome Web Store"), "uBlock Origin Lite");
});

test("download and update-check addresses are Chrome's", () => {
  const download = new URL(crx.downloadURL("abcdefghijklmnopabcdefghijklmnop", "156.0.8078.49"));
  assert.equal(download.host, "clients2.google.com");
  assert.equal(download.searchParams.get("response"), "redirect");
  assert.equal(download.searchParams.get("prodversion"), "156.0.8078.49");
  assert.equal(new URLSearchParams(download.searchParams.get("x")).get("id"), "abcdefghijklmnopabcdefghijklmnop");
  const check = new URL(crx.updateCheckURL([{ id: "a".repeat(32), version: "1.0" }, { id: "b".repeat(32), version: "2.5.1" }], "156.0.0.0"));
  assert.equal(check.searchParams.get("response"), "updatecheck");
  assert.deepEqual(check.searchParams.getAll("x").map((x) => Object.fromEntries(new URLSearchParams(x))), [
    { id: "a".repeat(32), v: "1.0", uc: "" }, { id: "b".repeat(32), v: "2.5.1", uc: "" },
  ]);
});

test("update answers are read, only offered versions with an https codebase", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><gupdate xmlns="http://www.google.com/update2/response" protocol="2.0" server="prod">
    <daystart elapsed_days="7000"/>
    <app appid="${"a".repeat(32)}" cohort="1::" status="ok"><updatecheck codebase="https://clients2.googleusercontent.com/crx/blobs/x/A.crx?a=1&amp;b=2" fp="1.x" hash_sha256="00" protected="0" size="1" status="ok" version="1.2.4"/></app>
    <app appid="${"b".repeat(32)}" status="ok"><updatecheck status="noupdate"/></app>
    <app appid="${"c".repeat(32)}" status="ok"><updatecheck codebase="http://insecure.example/C.crx" status="ok" version="9"/></app>
  </gupdate>`;
  const updates = crx.parseUpdateResponse(xml);
  assert.deepEqual([...updates.keys()], ["a".repeat(32)]);
  assert.deepEqual(updates.get("a".repeat(32)), { version: "1.2.4", codebase: "https://clients2.googleusercontent.com/crx/blobs/x/A.crx?a=1&b=2" });
});

test("versions compare as Chrome compares them", () => {
  assert.equal(crx.compareVersions("1.2.4", "1.2.3"), 1);
  assert.equal(crx.compareVersions("1.10", "1.9"), 1);
  assert.equal(crx.compareVersions("2", "2.0.0"), 0);
  assert.equal(crx.compareVersions("0.9", "1"), -1);
});

test("a format 3 .crx is read, checked and keeps its key's ID", () => {
  const zip = zipOf(SAMPLE);
  const made = crx3(zip);
  const parsed = crx.parseCrx(made.data);
  assert.equal(parsed.version, 3);
  assert.equal(parsed.id, made.id);
  assert.equal(crx.idOfKey(parsed.publicKey), made.id);
  assert.ok(new AdmZip(parsed.zip).getEntry("manifest.json"));
  // A changed byte of the zip breaks the signature.
  const tampered = Buffer.from(made.data);
  tampered[tampered.length - 30] ^= 0xff;
  assert.throws(() => crx.parseCrx(tampered), /signature/);
  // Cut short.
  assert.throws(() => crx.parseCrx(made.data.subarray(0, 20)), /cut short|signed|say/);
});

test("a .crx signed by a key other than its ID's is refused", () => {
  const zip = zipOf(SAMPLE);
  const one = crx3(zip, newKey());
  const other = crx3(zip, newKey());
  // Splice: the header's signed ID of one, the proof of the other.
  const headerLength = (data) => data.readUInt32LE(8);
  const header = (data) => crx.protobufFields(data.subarray(12, 12 + headerLength(data)));
  const signedOfOne = header(one.data)[10000][0];
  const proofOfOther = header(other.data)[2][0];
  const field = (n, bytes) => Buffer.concat([Buffer.from(n === 2 ? [0x12] : [0x82, 0xf1, 0x04]), varint(bytes.length), bytes]);
  const varint = (n) => { const out = []; while (n > 127) { out.push((n & 0x7f) | 0x80); n = Math.floor(n / 128); } out.push(n); return Buffer.from(out); };
  const spliced = Buffer.concat([field(2, proofOfOther), field(10000, signedOfOne)]);
  const lengths = Buffer.alloc(8);
  lengths.writeUInt32LE(3, 0);
  lengths.writeUInt32LE(spliced.length, 4);
  assert.throws(() => crx.parseCrx(Buffer.concat([Buffer.from("Cr24"), lengths, spliced, zip])), /own key/);
});

test("a format 2 .crx is read and checked; a zip isn't a .crx", () => {
  const zip = zipOf(SAMPLE);
  const made = crx2(zip);
  const parsed = crx.parseCrx(made.data);
  assert.equal(parsed.version, 2);
  assert.equal(parsed.id, made.id);
  const tampered = Buffer.from(made.data);
  tampered[tampered.length - 10] ^= 0xff;
  assert.throws(() => crx.parseCrx(tampered), /signature/);
  assert.equal(crx.parseCrx(zip), null);
});

test("names are looked up in the extension's languages", () => {
  const tables = { fr: { appName: { message: "Bloqueur" } }, en: { APPNAME: { message: "Blocker" } } };
  const messages = (locale) => tables[locale] || null;
  const manifest = { name: "__MSG_appName__", default_locale: "en" };
  assert.equal(crx.localized(manifest.name, manifest, messages, ["fr_FR", "fr"]), "Bloqueur");
  assert.equal(crx.localized(manifest.name, manifest, messages, ["de"]), "Blocker");
  assert.equal(crx.localized("Plain", manifest, messages, []), "Plain");
  assert.equal(crx.localized("__MSG_missing__", manifest, messages, []), "");
  assert.deepEqual(crx.localeFolders("fr-FR"), ["fr_FR", "fr"]);
  assert.deepEqual(crx.localeFolders("en"), ["en"]);
});

test("what an extension may do is listed as Chrome lists it", () => {
  assert.deepEqual(crx.permissionSummary({ content_scripts: [{ matches: ["<all_urls>"] }], permissions: ["storage"] }), ["Read and change all your data on all websites"]);
  assert.deepEqual(crx.permissionSummary({ host_permissions: ["https://*.example.com/*", "https://news.test/*"], permissions: ["tabs", "declarativeNetRequest"] }),
    ["Read and change your data on example.com, news.test", "Read your browsing history", "Block content on any page"]);
  assert.deepEqual(crx.permissionSummary({}), []);
});
