// Whether a site can catch the protections' noise, in a build of Noor
// ("windows", "iphone" or "android"), with every noise on: the checks bot
// detectors make (CreepJS's "lies") by reading one value two ways that a
// real browser keeps equal. A caught noise makes a profile stand out more
// than the value it hides. Checks:
// - ClientRects: an element 100.5 × 20 px measured by getBoundingClientRect,
//   getClientRects and offsetWidth, and a Range over its text;
// - canvas: getImageData against toDataURL drawn back, and two reads alike;
// - audio: getChannelData against copyFromChannel, and two renders alike;
// - WebGL: readPixels against toDataURL drawn back.
// Each check is run with every noise off too: only what holds with the
// noise off and fails with it on is the noise caught (a GPU canvas, for
// one, reads back a little differently the second time in Chromium itself).
// Prints each check; exits 1 if any noise is caught.
// Needs Playwright and a display: `xvfb-run -a node tools/probe-lies.js [windows|iphone|android]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const BUILD = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PROBE = `(async () => {
  const out = {};
  const fnv = (bytes) => { let h = 0x811c9dc5; for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h; };
  // ClientRects.
  const box = document.createElement("div");
  box.style.cssText = "position:absolute;left:10px;top:10px;width:100.5px;height:20px;font:16px Arial";
  box.textContent = "Noor probe text";
  document.body.appendChild(box);
  const b = box.getBoundingClientRect();
  const c = box.getClientRects()[0];
  const range = document.createRange();
  range.selectNode(box);
  const r = range.getBoundingClientRect();
  out.rects = {
    bounding: [b.x, b.y, b.width, b.height], client: [c.x, c.y, c.width, c.height], range: [r.x, r.y, r.width, r.height],
    offset: [box.offsetLeft, box.offsetTop, box.offsetWidth, box.offsetHeight],
    again: (() => { const a = box.getBoundingClientRect(); return [a.x, a.y, a.width, a.height]; })(),
  };
  out.rects.lies = [];
  if (out.rects.bounding.join() !== out.rects.client.join()) out.rects.lies.push("getBoundingClientRect != getClientRects");
  if (out.rects.bounding.join() !== out.rects.range.join()) out.rects.lies.push("element != Range");
  if (out.rects.bounding.join() !== out.rects.again.join()) out.rects.lies.push("two reads differ");
  if (Math.round(b.height) !== box.offsetHeight || Math.abs(b.height - 20) > 1e-9) out.rects.lies.push("height " + b.height + " for 20px");
  if (Math.abs(b.width - 100.5) > 1e-9) out.rects.lies.push("width " + b.width + " for 100.5px");
  if (Math.abs(b.x - 10) > 1e-9 || Math.abs(b.y - 10) > 1e-9) out.rects.lies.push("position " + b.x + "," + b.y + " for 10,10");
  box.remove();
  // Canvas.
  const canvas = document.createElement("canvas");
  canvas.width = 200; canvas.height = 50;
  const x = canvas.getContext("2d");
  x.font = "18px Arial"; x.fillStyle = "#123"; x.fillText("Noor \\u{1F600} probe", 4, 30);
  x.fillStyle = "rgba(200, 50, 100, 0.6)"; x.beginPath(); x.arc(160, 25, 20, 0, 7); x.fill();
  const read1 = fnv(x.getImageData(0, 0, 200, 50).data);
  const read2 = fnv(x.getImageData(0, 0, 200, 50).data);
  const viaUrl = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { const c2 = document.createElement("canvas"); c2.width = 200; c2.height = 50; const y = c2.getContext("2d"); y.drawImage(img, 0, 0); resolve(fnv(y.getImageData(0, 0, 200, 50).data)); };
    img.onerror = () => resolve("ERR");
    img.src = canvas.toDataURL();
  });
  out.canvas = { read1, read2, viaUrl, lies: [] };
  if (read1 !== read2) out.canvas.lies.push("two reads differ");
  if (read1 !== viaUrl) out.canvas.lies.push("getImageData != toDataURL drawn back");
  // Audio.
  const render = async () => {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const osc = ctx.createOscillator(); osc.type = "triangle"; osc.frequency.value = 10000;
    const comp = ctx.createDynamicsCompressor();
    osc.connect(comp); comp.connect(ctx.destination); osc.start(0);
    const buffer = await ctx.startRendering();
    const data = buffer.getChannelData(0);
    const copy = new Float32Array(buffer.length); buffer.copyFromChannel(copy, 0);
    let a = 0, c = 0; for (let i = 4500; i < 5000; i++) { a += Math.abs(data[i]); c += Math.abs(copy[i]); }
    return [a, c];
  };
  const [first, firstCopy] = await render();
  const [second] = await render();
  out.audio = { first, firstCopy, second, lies: [] };
  if (first !== firstCopy) out.audio.lies.push("getChannelData != copyFromChannel");
  if (first !== second) out.audio.lies.push("two renders differ");
  // WebGL.
  const glCanvas = document.createElement("canvas");
  glCanvas.width = 32; glCanvas.height = 32;
  const gl = glCanvas.getContext("webgl", { preserveDrawingBuffer: true });
  if (gl) {
    gl.clearColor(0.2, 0.4, 0.6, 1); gl.enable(gl.SCISSOR_TEST); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.scissor(4, 4, 10, 10); gl.clearColor(0.9, 0.1, 0.3, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    const px = new Uint8Array(32 * 32 * 4); gl.readPixels(0, 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const flipped = new Uint8Array(px.length);
    for (let row = 0; row < 32; row++) flipped.set(px.subarray(row * 128, row * 128 + 128), (31 - row) * 128);
    const viaUrl = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { const c2 = document.createElement("canvas"); c2.width = 32; c2.height = 32; const y = c2.getContext("2d"); y.drawImage(img, 0, 0); resolve(fnv(y.getImageData(0, 0, 32, 32).data)); };
      img.onerror = () => resolve("ERR");
      img.src = glCanvas.toDataURL();
    });
    out.webgl = { readPixels: fnv(flipped), viaUrl, lies: [] };
    if (out.webgl.readPixels !== viaUrl) out.webgl.lies.push("readPixels != toDataURL drawn back");
  } else out.webgl = { lies: [], skipped: "no webgl" };
  return out;
})()`;

(async () => {
  const web = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end("<!doctype html><title>lies</title><body style='margin:0'><p>lies</p></body>");
  });
  await new Promise((resolve) => web.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${web.address().port}/`;
  const app = await electron.launch({
    executablePath: require(path.join(root, "node_modules", "electron")),
    args: [root, "--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
    env: { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), "noor-lies-")), NOOR_DEVICE: BUILD, NOOR_TEST_TIMEZONE: "Africa/Casablanca" },
  });
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  const probe = async (on) => {
    await main((electron, isOn) => { for (const kind of ["canvas", "webGL", "audio", "clientRects"]) global.noorTest.context.fingerprint.setEnabled(kind, isOn); }, on);
    await main((electron, url) => { global.noorTest.browser.newTab({ url }); }, base);
    await sleep(2500);
    return main((electron, code) => global.noorTest.browser.selected.webContents.executeJavaScript(code, true), PROBE);
  };
  // Every noise on, as a profile may have it; then every noise off.
  const result = { build: BUILD, on: await probe(true), off: await probe(false) };
  await app.close().catch(() => {});
  web.close();
  const lies = (r, k) => (r[k].lies || []).map((l) => `${k}: ${l.replace(/[-\d.]+(?= for)/, "…")}`);
  const offLies = new Set([].concat(...["rects", "canvas", "audio", "webgl"].map((k) => lies(result.off, k))));
  result.alsoOff = [...offLies];
  result.caught = [].concat(...["rects", "canvas", "audio", "webgl"].map((k) => lies(result.on, k))).filter((l) => !offLies.has(l));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.caught.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
