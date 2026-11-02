// Every way a page can read back what it drew on a canvas, with the canvas
// protection on and off: getImageData, toDataURL, toBlob, a copy drawn on
// another canvas, an image bitmap, a bitmap renderer, WebCodecs'
// VideoFrame (copyTo; of a canvas, an OffscreenCanvas, an image bitmap),
// WebGL's texImage2D then readPixels, captureStream's frame, a pattern; and
// in a worker, an OffscreenCanvas read and its VideoFrame. A way that reads
// the same with the protection on as off hands a site the drawing as this
// computer made it (the device's fingerprint), past the protection: counted.
// VideoFrame, replaced by Noor, must still be the browser's (its toString,
// name, length, constructor, prototype, and its error without "new").
// Prints each way's hash; exits 1 if one reads the real drawing.
// Needs Playwright and a display:
// `xvfb-run -a node tools/probe-canvas-reads.js [windows|iphone|android]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const BUILD = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const COMMON = `
const fnv = (bytes) => { let h = 0x811c9dc5; for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
const paint = (x) => { x.fillStyle = "#f60"; x.fillRect(0, 0, 120, 40); x.fillStyle = "#069"; x.font = "17px Arial"; x.fillText("Noor probe 1.0", 3, 26); x.strokeStyle = "rgba(0,180,0,0.7)"; x.beginPath(); x.arc(100, 20, 12, 0, 6.28); x.stroke(); };
const frameBytes = async (source) => { const f = new VideoFrame(source, { timestamp: 0 }); const buf = new Uint8Array(f.allocationSize({ format: "RGBA" })); await f.copyTo(buf, { format: "RGBA" }); f.close(); return fnv(buf); };
const ways = {};
const tried = async (name, fn) => { try { ways[name] = await fn(); } catch (e) { ways[name] = "ERR " + e.name + ": " + e.message; } };
`;

const PAGE = `<!doctype html><title>canvas reads</title><body><script>
${COMMON}
const drawn = () => { const c = Object.assign(document.createElement("canvas"), { width: 120, height: 40 }); paint(c.getContext("2d")); return c; };
const pixelsOf = (source) => { const c = Object.assign(document.createElement("canvas"), { width: 120, height: 40 }); const x = c.getContext("2d"); x.drawImage(source, 0, 0); return fnv(x.getImageData(0, 0, 120, 40).data); };
const hasFrames = typeof VideoFrame === "function";
(async () => {
  await tried("getImageData", () => fnv(drawn().getContext("2d").getImageData(0, 0, 120, 40).data));
  await tried("toDataURL", () => fnv(new TextEncoder().encode(drawn().toDataURL())));
  await tried("toBlob", () => new Promise((r) => drawn().toBlob(async (b) => r(fnv(new Uint8Array(await b.arrayBuffer()))))));
  await tried("drawn on another canvas", () => pixelsOf(drawn()));
  await tried("an image bitmap, drawn", async () => pixelsOf(await createImageBitmap(drawn())));
  await tried("a bitmap renderer's export", async () => { const c = Object.assign(document.createElement("canvas"), { width: 120, height: 40 }); c.getContext("bitmaprenderer").transferFromImageBitmap(await createImageBitmap(drawn())); return fnv(new TextEncoder().encode(c.toDataURL())); });
  await tried("WebGL texImage2D, readPixels", () => { const g = Object.assign(document.createElement("canvas"), { width: 120, height: 40 }).getContext("webgl"); const t = g.createTexture(); g.bindTexture(g.TEXTURE_2D, t); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, drawn()); const fb = g.createFramebuffer(); g.bindFramebuffer(g.FRAMEBUFFER, fb); g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, t, 0); const px = new Uint8Array(120 * 40 * 4); g.readPixels(0, 0, 120, 40, g.RGBA, g.UNSIGNED_BYTE, px); return fnv(px); });
  await tried("a pattern of it", () => { const c = Object.assign(document.createElement("canvas"), { width: 120, height: 40 }); const x = c.getContext("2d"); x.fillStyle = x.createPattern(drawn(), "no-repeat"); x.fillRect(0, 0, 120, 40); return fnv(x.getImageData(0, 0, 120, 40).data); });
  if (typeof ImageCapture === "function") await tried("captureStream's frame", async () => { const track = drawn().captureStream(0).getVideoTracks()[0]; if (track.requestFrame) track.requestFrame(); const bmp = await new ImageCapture(track).grabFrame(); track.stop(); return pixelsOf(bmp); });
  if (hasFrames) {
    await tried("VideoFrame of a canvas, copyTo", () => frameBytes(drawn()));
    await tried("VideoFrame of an image bitmap, copyTo", async () => frameBytes(await createImageBitmap(drawn())));
    await tried("VideoFrame of an OffscreenCanvas, copyTo", () => { const o = new OffscreenCanvas(120, 40); paint(o.getContext("2d")); return frameBytes(o); });
    await tried("VideoFrame of a canvas, drawn", async () => { const f = new VideoFrame(drawn(), { timestamp: 0 }); const r = pixelsOf(f); f.close(); return r; });
    await tried("VideoFrame itself", () => { const f = new VideoFrame(drawn(), { timestamp: 0 }); const r = [Function.prototype.toString.call(VideoFrame), VideoFrame.name, VideoFrame.length, f.constructor === VideoFrame, Object.getPrototypeOf(f) === VideoFrame.prototype, f instanceof VideoFrame, f.codedWidth + "x" + f.codedHeight].join(" | "); f.close(); return "API " + r; });
    await tried("VideoFrame without new", () => { try { VideoFrame(drawn()); return "API no throw"; } catch (e) { return "API " + e.name + ": " + e.message; } });
  }
  await tried("in a worker", () => new Promise((resolve) => { const w = new Worker("/worker.js"); w.onmessage = (e) => resolve(e.data); w.onerror = (e) => resolve("ERR worker " + e.message); setTimeout(() => resolve("ERR timeout"), 10000); }));
  window.__ways = ways;
})();
</script>`;
const WORKER = `${COMMON}
(async () => {
  const drawn = () => { const o = new OffscreenCanvas(120, 40); paint(o.getContext("2d")); return o; };
  await tried("getImageData", () => fnv(drawn().getContext("2d").getImageData(0, 0, 120, 40).data));
  if (typeof VideoFrame === "function") await tried("VideoFrame copyTo", () => frameBytes(drawn()));
  postMessage(ways);
})();`;

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("cache-control", "no-store");
    if (req.url.startsWith("/worker.js")) { res.setHeader("content-type", "text/javascript"); return res.end(WORKER); }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(PAGE);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://canvas.localhost:${server.address().port}/`;
  const visit = async (settings) => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-canvasreads-"));
    if (settings) fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify(settings));
    const env = { ...process.env, NOOR_TEST: "1", NOOR_TEST_TIMEZONE: "Africa/Casablanca", NOOR_USER_DATA: userData, NOOR_DEVICE: BUILD };
    const app = await electron.launch({ executablePath: require(path.join(root, "node_modules", "electron")), args: [root, "--no-sandbox", "--enable-unsafe-swiftshader"], env });
    for (let i = 0; i < 200; i++) {
      if (await app.evaluate(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
      await sleep(100);
    }
    await sleep(1000);
    const ways = await app.evaluate(async (electron, address) => {
      const tab = global.noorTest.browser.newTab({ url: address });
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 250));
        const done = await tab.webContents.executeJavaScript("window.__ways || null").catch(() => null);
        if (done) return done;
      }
      return { error: "no answer" };
    }, url);
    await app.close().catch(() => {});
    return ways;
  };
  const on = await visit(null);
  const off = await visit({ "protection.canvas": false, "protection.webGL": false });
  server.close();

  const problems = [];
  const flat = (ways) => {
    const out = {};
    for (const [name, value] of Object.entries(ways || {})) {
      if (value && typeof value === "object") for (const [inner, v] of Object.entries(value)) out[`${name}: ${inner}`] = v;
      else out[name] = value;
    }
    return out;
  };
  const a = flat(on);
  const b = flat(off);
  if (on.error || off.error) problems.push(`no answer (${on.error || off.error})`);
  for (const name of Object.keys(a)) {
    const mine = String(a[name]);
    const real = String(b[name]);
    let verdict = "protected";
    if (/^API /.test(mine)) {
      verdict = mine === real ? "as the browser's" : "UNLIKE THE BROWSER'S";
      if (mine !== real) problems.push(`${name}: ${mine} (the browser's: ${real})`);
    } else if (/^ERR/.test(mine)) {
      verdict = /^ERR/.test(real) ? "fails as without the protection" : "FAILS ONLY WITH THE PROTECTION";
      if (!/^ERR/.test(real)) problems.push(`${name}: ${mine}`);
    } else if (mine === real) {
      verdict = "THE REAL DRAWING";
      problems.push(`${name} reads the real drawing (${mine})`);
    }
    console.log(`${verdict.padEnd(32)} ${name.padEnd(44)} on ${mine.slice(0, 70)} | off ${real.slice(0, 40)}`);
  }
  const pixelWays = Object.keys(a).filter((name) => /getImageData|drawn|copyTo|bitmap, drawn|pattern|frame$/.test(name) && !/^ERR|^API/.test(String(a[name])));
  const kinds = new Set(pixelWays.map((name) => a[name]));
  console.log(`NOTE: the pixel reads give ${kinds.size} value(s) with the protection on (${pixelWays.length} ways)`);
  console.log(problems.length ? `CANVAS READS: ${problems.length} PROBLEM(S): ${problems.join(" | ")}` : "CANVAS READS: no way reads the real drawing");
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
