// Whether Noor's protection breaks what pages do: a page served here calls
// some sixty of what sites use (2D canvas drawn, read and saved, offscreen
// canvas, WebGL and WebGL2, audio rendered and analysed, fonts, Intl and
// the time zone, navigator and its client hints, the screen and media
// queries, permissions, devices, WebRTC), in the page, in a frame of the
// same site and in a worker; every throw of a call, every error the page
// doesn't catch and every error Chromium writes for the page is kept. The
// same with every protection off: an error only with the protection on is
// Noor's doing (a site broken), counted.
// It also measures how far the protection moves what a page draws: the
// same drawing read back with the protection on and off, per channel
// (most a pixel moved) and pixels moved (of all): a protection that moved
// a drawing as one sees it would be a distortion, counted past the limits
// below.
// Prints what it found; exits 1 if the protection broke a call or moved a
// drawing past the limits. Needs Playwright and a display.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BUILD = process.argv[2] && ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
// A drawing moved by at most this much per channel, on at most this share
// of its pixels, looks the same.
const MOST_PER_CHANNEL = 4;
const MOST_SHARE = 0.25;

// The calls, as one script run in a page, a frame and a worker alike
// (what a worker lacks is skipped there, not an error).
const CALLS = `
const inWorker = typeof document === "undefined";
const calls = {};
const tried = async (name, fn) => { try { const v = await fn(); calls[name] = { ok: true, v: typeof v === "string" ? v.slice(0, 80) : v }; } catch (e) { calls[name] = { ok: false, error: (e && e.name) + ": " + (e && e.message) }; } };
const canvas = (w, h) => inWorker ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
const drawing = (c) => { const x = c.getContext("2d"); const g = x.createLinearGradient(0, 0, 200, 0); g.addColorStop(0, "#c00"); g.addColorStop(1, "#06c"); x.fillStyle = g; x.fillRect(0, 0, 200, 50); x.fillStyle = "#fff"; x.font = "18px sans-serif"; x.fillText("Noor drawing 123", 10, 30); x.beginPath(); x.arc(170, 25, 15, 0, Math.PI * 2); x.strokeStyle = "#0a0"; x.lineWidth = 3; x.stroke(); return x; };
const run = async () => {
  await tried("canvas.getImageData", () => drawing(canvas(200, 50)).getImageData(0, 0, 200, 50).data.length);
  await tried("canvas.putImageData", () => { const x = drawing(canvas(200, 50)); x.putImageData(x.getImageData(0, 0, 10, 10), 20, 20); return true; });
  await tried("canvas.measureText", () => drawing(canvas(10, 10)).measureText("Noor").width > 0);
  await tried("canvas.isPointInPath", () => { const x = canvas(10, 10).getContext("2d"); x.rect(0, 0, 5, 5); return x.isPointInPath(2, 2); });
  if (!inWorker) await tried("canvas.toDataURL", () => { const c = canvas(200, 50); drawing(c); return c.toDataURL().slice(0, 22); });
  if (!inWorker) await tried("canvas.toBlob", () => new Promise((r, j) => { const c = canvas(200, 50); drawing(c); c.toBlob((b) => (b ? r(b.size > 0) : j(new Error("no blob")))); }));
  await tried("offscreen.convertToBlob", async () => { const c = new OffscreenCanvas(200, 50); drawing(c); return (await c.convertToBlob()).size > 0; });
  await tried("offscreen.transferToImageBitmap", () => { const c = new OffscreenCanvas(20, 20); drawing(c); return c.transferToImageBitmap().width; });
  await tried("createImageBitmap", async () => { const c = canvas(20, 20); drawing(c); return (await createImageBitmap(c)).width; });
  for (const kind of ["webgl", "webgl2"]) {
    await tried(kind + ".context", () => Boolean(canvas(64, 64).getContext(kind)));
    await tried(kind + ".parameters", () => { const gl = canvas(64, 64).getContext(kind); return [gl.VERSION, gl.SHADING_LANGUAGE_VERSION, gl.VENDOR, gl.RENDERER, gl.MAX_TEXTURE_SIZE, gl.MAX_VIEWPORT_DIMS, gl.ALIASED_LINE_WIDTH_RANGE].map((p) => String(gl.getParameter(p))).join("|"); });
    await tried(kind + ".extensions", () => canvas(64, 64).getContext(kind).getSupportedExtensions().length);
    await tried(kind + ".debugRenderer", () => { const gl = canvas(64, 64).getContext(kind); const e = gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); });
    await tried(kind + ".precision", () => { const gl = canvas(64, 64).getContext(kind); const p = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT); return [p.rangeMin, p.rangeMax, p.precision].join(","); });
    await tried(kind + ".readPixels", () => { const gl = canvas(16, 16).getContext(kind); gl.clearColor(0.2, 0.4, 0.6, 1); gl.clear(gl.COLOR_BUFFER_BIT); const px = new Uint8Array(16 * 16 * 4); gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, px); return px[0]; });
  }
  if (!inWorker) await tried("audio.offlineRender", async () => { const a = new OfflineAudioContext(1, 4410, 44100); const o = a.createOscillator(); const c = a.createDynamicsCompressor(); o.connect(c); c.connect(a.destination); o.start(); const b = await a.startRendering(); return b.getChannelData(0).length; });
  if (!inWorker) await tried("audio.copyFromChannel", async () => { const a = new OfflineAudioContext(1, 1000, 44100); const o = a.createOscillator(); o.connect(a.destination); o.start(); const b = await a.startRendering(); const f = new Float32Array(10); b.copyFromChannel(f, 0, 100); return f.length; });
  if (!inWorker) await tried("audio.analyser", () => { const a = new AudioContext(); const n = a.createAnalyser(); const d = new Float32Array(n.frequencyBinCount); n.getFloatFrequencyData(d); a.close(); return d.length; });
  await tried("intl.timeZone", () => Intl.DateTimeFormat().resolvedOptions().timeZone);
  await tried("intl.locale", () => Intl.DateTimeFormat().resolvedOptions().locale);
  await tried("intl.number", () => new Intl.NumberFormat().format(1234.5));
  await tried("date.offset", () => new Date().getTimezoneOffset());
  await tried("date.string", () => new Date(0).toString());
  await tried("navigator.basics", () => [navigator.userAgent, navigator.platform, navigator.language, navigator.languages.join(","), navigator.hardwareConcurrency, navigator.deviceMemory].join("|"));
  await tried("navigator.highEntropy", async () => { const h = await navigator.userAgentData.getHighEntropyValues(["platform", "platformVersion", "architecture", "model", "uaFullVersion", "fullVersionList", "bitness", "wow64"]); return h.platform + " " + h.platformVersion; });
  await tried("navigator.brands", () => navigator.userAgentData.brands.map((b) => b.brand).join(","));
  await tried("navigator.permissions", async () => (await navigator.permissions.query({ name: "notifications" })).state);
  await tried("navigator.storage", async () => (await navigator.storage.estimate()).quota > 0);
  if (!inWorker) {
    await tried("navigator.plugins", () => navigator.plugins.length + "/" + navigator.mimeTypes.length);
    await tried("navigator.maxTouchPoints", () => navigator.maxTouchPoints);
    await tried("navigator.mediaDevices", async () => (await navigator.mediaDevices.enumerateDevices()).length);
    await tried("navigator.getBattery", async () => (navigator.getBattery ? (await navigator.getBattery()).level : "none"));
    await tried("navigator.connection", () => (navigator.connection ? navigator.connection.effectiveType : "none"));
    await tried("navigator.webdriver", () => navigator.webdriver);
    await tried("screen", () => [screen.width, screen.height, screen.availWidth, screen.availHeight, screen.colorDepth, devicePixelRatio, innerWidth, innerHeight, outerWidth, outerHeight].join("|"));
    await tried("matchMedia", () => ["(pointer: fine)", "(hover: hover)", "(prefers-color-scheme: dark)", "(min-width: 100px)"].map((q) => matchMedia(q).matches).join(","));
    await tried("fonts.check", () => document.fonts.check("16px Arial"));
    await tried("fonts.load", async () => (await document.fonts.load("16px Arial")).length >= 0);
    await tried("fontFace.local", async () => { const f = new FontFace("NoorLocal", "local(Arial)"); await f.load().catch(() => {}); return f.status; });
    await tried("element.rects", () => { const d = document.createElement("div"); d.textContent = "Noor rects"; document.body.appendChild(d); const r = d.getBoundingClientRect(); const n = d.getClientRects().length; d.remove(); return r.width > 0 && n > 0; });
    await tried("range.rects", () => { const r = document.createRange(); r.selectNodeContents(document.body); return r.getClientRects().length >= 0; });
    await tried("speech.voices", () => (window.speechSynthesis ? speechSynthesis.getVoices().length : "none"));
    await tried("webrtc.offer", async () => { const pc = new RTCPeerConnection(); pc.createDataChannel("d"); const offer = await pc.createOffer(); await pc.setLocalDescription(offer); await new Promise((r) => setTimeout(r, 800)); pc.close(); return offer.sdp.length > 0; });
    await tried("history.pushState", () => { history.pushState({}, "", location.pathname + "?state"); return location.search; });
    await tried("crypto.subtle", async () => (await crypto.subtle.digest("SHA-256", new Uint8Array([1, 2, 3]))).byteLength);
    await tried("functions.toString", () => [HTMLCanvasElement.prototype.toDataURL, CanvasRenderingContext2D.prototype.getImageData, WebGLRenderingContext.prototype.getParameter, Navigator.prototype.hasOwnProperty("userAgent") ? "own" : "proto"].map(String).join("|").length > 0);
  }
  return calls;
};
`;

// The drawing read back, to measure how far the protection moves it.
const PIXELS = `(() => { const c = Object.assign(document.createElement("canvas"), { width: 200, height: 50 }); const x = c.getContext("2d"); const g = x.createLinearGradient(0, 0, 200, 0); g.addColorStop(0, "#c00"); g.addColorStop(1, "#06c"); x.fillStyle = g; x.fillRect(0, 0, 200, 50); x.fillStyle = "#fff"; x.font = "18px sans-serif"; x.fillText("Noor drawing 123", 10, 30); return Array.from(x.getImageData(0, 0, 200, 50).data); })()`;

const PAGE = `<!doctype html><title>calls</title><body><script>
window.__errors = [];
addEventListener("error", (e) => window.__errors.push("error: " + e.message));
addEventListener("unhandledrejection", (e) => window.__errors.push("rejection: " + (e.reason && e.reason.message || e.reason)));
${CALLS}
window.__page = run();
window.__frame = new Promise((resolve) => { const f = document.createElement("iframe"); f.src = "/frame"; addEventListener("message", (e) => { if (e.data && e.data.frame) resolve(e.data.frame); }); document.body.appendChild(f); setTimeout(() => resolve("timeout"), 20000); });
window.__worker = new Promise((resolve) => { const w = new Worker("/worker.js"); w.onmessage = (e) => resolve(e.data); w.onerror = (e) => resolve({ workerError: e.message }); setTimeout(() => resolve("timeout"), 20000); });
</script>`;
const FRAME = `<!doctype html><body><script>${CALLS}
run().then((calls) => parent.postMessage({ frame: calls }, "*"));
</script>`;
const WORKER = `${CALLS}
run().then((calls) => postMessage(calls), (e) => postMessage({ workerError: String(e) }));`;

const launch = async (settings) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-calls-"));
  if (settings) fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify(settings));
  const env = { ...process.env, NOOR_TEST: "1", NOOR_TEST_TIMEZONE: "Africa/Casablanca", NOOR_USER_DATA: userData, NOOR_DEVICE: BUILD };
  const app = await electron.launch({ executablePath: require(path.join(root, "node_modules", "electron")), args: [root, "--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1", "--enable-unsafe-swiftshader"], env });
  for (let i = 0; i < 200; i++) {
    if (await app.evaluate(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  await sleep(1000);
  return app;
};

const visit = (app, url) => app.evaluate(async (electron, [url, pixels]) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const browser = global.noorTest.browser;
  const tab = browser.newTab({ url });
  const logged = [];
  tab.webContents.on("console-message", (event, level, message) => {
    const lvl = event && typeof event.level === "string" ? event.level : level;
    const text = event && typeof event.message === "string" ? event.message : message;
    if (lvl === "error" || lvl === 3) logged.push(String(text).slice(0, 200));
  });
  for (let i = 0; i < 100 && tab.webContents.isLoading(); i++) await wait(100);
  await wait(500);
  const got = await tab.webContents.executeJavaScript("Promise.all([window.__page, window.__frame, window.__worker]).then(([page, frame, worker]) => ({ page, frame, worker, errors: window.__errors }))", true);
  got.pixels = await tab.webContents.executeJavaScript(pixels, true);
  got.console = logged;
  browser.close(tab);
  return got;
}, [url, PIXELS]);

(async () => {
  const server = http.createServer((req, res) => {
    const url = req.url.split("?")[0];
    const send = (type, body) => { res.setHeader("content-type", type); res.setHeader("cache-control", "no-store"); res.end(body); };
    if (url === "/frame") return send("text/html", FRAME);
    if (url === "/worker.js") return send("text/javascript", WORKER);
    send("text/html", PAGE);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  // A secure context (localhost is one, as https is), where a site's page
  // has what only such a context has (client hints, storage, devices,
  // crypto.subtle): a page of this computer.
  const url = `http://calls.localhost:${server.address().port}/`;
  const off = {};
  for (const kind of ["canvas", "webGL", "gpu", "audio", "clientRects", "screen", "hardware", "fonts"]) off[`protection.${kind}`] = false;
  const result = {};
  for (const [name, settings] of [["on", null], ["off", off]]) {
    const app = await launch(settings);
    result[name] = await visit(app, url);
    await app.close().catch(() => {});
  }
  server.close();

  const problems = [];
  // A call that throws only with the protection on, wherever it ran.
  for (const where of ["page", "frame", "worker"]) {
    const on = result.on[where] || {};
    const offCalls = result.off[where] || {};
    if (typeof on !== "object" || on.workerError || on === "timeout") { problems.push(`${where}: ${JSON.stringify(on).slice(0, 200)}`); continue; }
    for (const [name, call] of Object.entries(on)) {
      const before = offCalls[name];
      if (call && call.ok === false && !(before && before.ok === false)) problems.push(`${where}: ${name} throws with the protection on: ${call.error}`);
    }
  }
  // Errors the page didn't catch, or Chromium wrote, only with the protection on.
  for (const kind of ["errors", "console"]) {
    const fresh = (result.on[kind] || []).filter((e) => !(result.off[kind] || []).includes(e));
    if (fresh.length) problems.push(`${kind} only with the protection on: ${JSON.stringify(fresh).slice(0, 400)}`);
  }
  // How far the drawing moved.
  const a = result.on.pixels;
  const b = result.off.pixels;
  let most = 0;
  let moved = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3]));
    most = Math.max(most, d);
    if (d) moved++;
  }
  result.drawing = { mostPerChannel: most, pixelsMoved: moved, pixels: a.length / 4, share: Number((moved / (a.length / 4)).toFixed(4)) };
  if (most > MOST_PER_CHANNEL || result.drawing.share > MOST_SHARE) problems.push(`the drawing moved past the limits (${MOST_PER_CHANNEL} per channel, ${MOST_SHARE * 100}% of pixels): ${JSON.stringify(result.drawing)}`);
  const counts = {};
  for (const where of ["page", "frame", "worker"]) {
    const on = result.on[where] || {};
    counts[where] = typeof on === "object" ? `${Object.values(on).filter((c) => c && c.ok).length} of ${Object.keys(on).length} calls ran` : on;
  }
  result.counts = counts;
  result.problems = problems;
  delete result.on.pixels;
  delete result.off.pixels;
  console.log(JSON.stringify(result, null, 1));
  console.log(`CALLS: ${JSON.stringify(counts)}; drawing ${JSON.stringify(result.drawing)}`);
  console.log(problems.length ? `PAGE ERRORS: THE PROTECTION BROKE ${problems.length}: ${problems.join(" | ").slice(0, 900)}` : "PAGE ERRORS: none from the protection");
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
