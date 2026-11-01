// Whether what protects a page also protects its workers, in a build of
// Noor ("windows", "iphone" or "android"): the same canvas drawing, WebGL
// drawing and font checks are hashed in the page, a dedicated worker, a
// shared worker and a service worker, in two profiles (two fresh profiles,
// each with seeds of its own) and with the canvas and WebGL protections off.
// A worker that reads this computer's real values (what the protections off
// show) gives a site the same hash in every profile; a worker that reads
// other values than its page shows the protection. Noor is started as a
// user starts it, with no test tool attached to its browser: a second
// debugger (Playwright's) keeps the shared worker from being protected.
// Prints the hashes; exits 1 if a worker leaks or disagrees.
// Needs a display: `xvfb-run -a node tools/probe-workers.js [windows|iphone|android]`;
// NOOR_ELECTRON=dist/linux-unpacked/noor-browser runs a built Noor instead
// (with the fuses package.json flips) of node_modules' Electron.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const BUILD = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";

/// The drawings and their hashes, the same code in a page and a worker.
const DRAW = String.raw`
const fnv = (bytes) => { let h = 0x811c9dc5; for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
const draw2d = (x) => {
  x.textBaseline = "top"; x.font = "17px Arial"; x.fillStyle = "#f60"; x.fillRect(100, 1, 62, 20);
  x.fillStyle = "#069"; x.fillText("Noor probe, \u{1F600} 1.0", 2, 15);
  x.fillStyle = "rgba(102, 204, 0, 0.7)"; x.fillText("Noor probe, \u{1F600} 1.0", 4, 17);
  const g = x.createLinearGradient(0, 0, 220, 0); g.addColorStop(0, "red"); g.addColorStop(1, "blue");
  x.fillStyle = g; x.beginPath(); x.arc(170, 40, 18, 0, Math.PI * 2); x.fill();
};
const canvasHash = (canvas) => { const x = canvas.getContext("2d"); draw2d(x); return fnv(x.getImageData(0, 0, canvas.width, canvas.height).data); };
const webglHash = (canvas) => {
  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true });
  if (!gl) return "no webgl";
  const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, "attribute vec2 p; varying vec2 v; void main() { v = p; gl_Position = vec4(p, 0.0, 1.0); }"); gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, "precision mediump float; varying vec2 v; void main() { gl_FragColor = vec4(sin(v.x * 7.3) * 0.5 + 0.5, cos(v.y * 5.1) * 0.5 + 0.5, fract(v.x * v.y * 13.7), 1.0); }"); gl.compileShader(fs);
  const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog); gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -0.2, 1, 0.9, 0.8]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  gl.clearColor(0.1, 0.2, 0.3, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  const px = new Uint8Array(64 * 64 * 4); gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return fnv(px);
};
const fontWidth = (x, family) => { x.font = "40px " + family; return x.measureText("mmmmmmmmmmlli Noor 123").width; };
// A font is there if text in it differs from any of the three generic
// families it falls back to, as sites test fonts: one generic family alone
// may be that very font (in a shared or service worker on Windows,
// Chromium's monospace is Arial: no page's settings there).
const GENERIC = ["monospace", "serif", "sans-serif"];
const fonts = (x) => { const base = GENERIC.map((g) => fontWidth(x, g)); return Object.fromEntries(["DejaVu Sans", "Liberation Mono", "Arial", "Calibri"].map((f) => [f, GENERIC.some((g, i) => fontWidth(x, "'" + f + "', " + g) !== base[i])])); };
const gpuHere = () => (self.navigator && navigator.gpu ? Promise.race([navigator.gpu.requestAdapter().then((a) => (a ? a.info.vendor + "/" + a.info.architecture : "no adapter"), (e) => "ERR " + e.message), new Promise((r) => setTimeout(() => r("timeout"), 5000))]) : Promise.resolve("none"));
const valuesHere = (makeCanvas) => {
  const out = {};
  try { out.canvas = canvasHash(makeCanvas(220, 60)); } catch (e) { out.canvas = "ERR " + e.message; }
  try { out.webgl = webglHash(makeCanvas(64, 64)); } catch (e) { out.webgl = "ERR " + e.message; }
  try { out.fonts = fonts(makeCanvas(10, 10).getContext("2d")); } catch (e) { out.fonts = "ERR " + e.message; }
  return out;
};
`;

const WORKER_BODY = `${DRAW}\nconst mine = async () => Object.assign(valuesHere((w, h) => new OffscreenCanvas(w, h)), { gpu: await gpuHere() });`;

const PAGE = `<!doctype html><title>workers</title><script>${DRAW}
(async () => {
  const out = { page: Object.assign(valuesHere((w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h })), { gpu: await gpuHere() }) };
  out.dedicated = await new Promise((resolve) => { const w = new Worker("/dedicated.js"); w.onmessage = (e) => resolve(e.data); w.onerror = (e) => resolve("ERR " + e.message); setTimeout(() => resolve("timeout"), 8000); });
  out.shared = await new Promise((resolve) => { const s = new SharedWorker("/shared.js?" + Math.random()); s.port.onmessage = (e) => resolve(e.data); s.port.start(); s.port.postMessage(1); setTimeout(() => resolve("timeout"), 8000); });
  out.service = await Promise.race([(async () => {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const worker = reg.active || reg.installing || reg.waiting;
    if (worker.state !== "activated") await new Promise((r) => worker.addEventListener("statechange", () => worker.state === "activated" && r()));
    const channel = new MessageChannel();
    const answer = new Promise((r) => { channel.port1.onmessage = (e) => r(e.data); });
    worker.postMessage(1, [channel.port2]);
    return answer;
  })().catch((e) => "ERR " + e), new Promise((r) => setTimeout(() => r("timeout"), 10000))]);
  await fetch("/report", { method: "POST", body: JSON.stringify(out) });
})();
</script><p>workers</p>`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const electronPath = process.env.NOOR_ELECTRON ? path.resolve(process.env.NOOR_ELECTRON) : require(path.join(root, "node_modules", "electron"));
/// A built app has its code beside it; Electron alone is given the source.
const appArgs = fs.existsSync(path.join(path.dirname(electronPath), "resources", "app.asar")) ? [] : [root];

/// Starts Noor with `settings` in a profile folder of its own, as a user
/// does, opens the probe page in it (as a second launch hands it an
/// address), and gives back what the page reports.
const run = async (settings) => {
  const reports = [];
  const web = http.createServer((req, res) => {
    const url = req.url.split("?")[0];
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => { try { reports.push(JSON.parse(body)); } catch (e) {} res.end("ok"); });
      return;
    }
    const send = (type, body) => { res.setHeader("content-type", type); res.setHeader("cache-control", "no-store"); res.end(body); };
    if (url === "/dedicated.js") return send("text/javascript", `${WORKER_BODY}\nmine().then((v) => postMessage(v));`);
    if (url === "/shared.js") return send("text/javascript", `${WORKER_BODY}\nonconnect = (e) => { const port = e.ports[0]; port.onmessage = () => mine().then((v) => port.postMessage(v)); };`);
    if (url === "/sw.js") return send("text/javascript", `${WORKER_BODY}\nself.addEventListener("install", () => self.skipWaiting()); self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim())); self.addEventListener("message", (e) => { const port = e.ports[0]; mine().then((v) => port.postMessage(v)); });`);
    send("text/html", PAGE);
  });
  await new Promise((resolve) => web.listen(0, "127.0.0.1", resolve));
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-workers-"));
  fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify(settings));
  const env = { ...process.env, NOOR_USER_DATA: userData, NOOR_DEVICE: BUILD, NOOR_TEST_OPEN_WINDOWS: "1" };
  delete env.NOOR_TEST;
  // (WebGPU drawn by SwiftShader where there is no graphics card, as on the
  // CI's Windows machine.)
  const args = [...appArgs, "--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader"];
  const first = spawn(electronPath, args, { env, stdio: "ignore" });
  await sleep(7000);
  const second = spawn(electronPath, [...args, `http://127.0.0.1:${web.address().port}/probe`], { env, stdio: "ignore" });
  await new Promise((resolve) => second.on("exit", resolve));
  const until = Date.now() + 60000;
  while (!reports.length && Date.now() < until) await sleep(250);
  first.kill();
  web.close();
  return reports[0] || { page: "no report" };
};

(async () => {
  const result = { build: BUILD };
  result.first = await run({});
  result.second = await run({});
  result.off = await run({ "protection.canvas": false, "protection.webGL": false, "protection.gpu": false });
  const problems = [];
  const places = ["page", "dedicated", "shared", "service"];
  for (const kind of ["canvas", "webgl", "gpu"]) {
    const real = result.off.page[kind];
    for (const where of places) {
      const a = result.first[where] && result.first[where][kind];
      const b = result.second[where] && result.second[where][kind];
      if (kind === "gpu" && (a === "none" || a === "no adapter")) continue;
      if (typeof a !== "string" || /^ERR|timeout|no webgl/.test(a)) { problems.push(`${kind} in ${where}: ${a}`); continue; }
      // (Noor iPhone names every adapter "apple", as Safari does: off or on.)
      if (a === real && !(kind === "gpu" && BUILD === "iphone")) problems.push(`${kind} in ${where}: this computer's real value`);
      // (Two profiles may show one card; Noor iPhone shows Safari's "apple" in all.)
      if (a === b && kind !== "gpu") problems.push(`${kind} in ${where}: the same in two profiles`);
      if (where !== "page" && a !== result.first.page[kind]) problems.push(`${kind} in ${where}: not what its page shows`);
    }
  }
  // A font a kind of worker tells apart from its page with the protection
  // off too is Chromium's own doing on this system (in a shared or service
  // worker on Windows, every generic family is Arial: no page's settings
  // there), not Noor's: said, not counted.
  result.notes = [];
  for (const where of places.slice(1)) {
    const page = result.first.page.fonts || {};
    const there = (result.first[where] && result.first[where].fonts) || {};
    const offPage = (result.off.page && result.off.page.fonts) || {};
    const offThere = (result.off[where] && result.off[where].fonts) || {};
    const chromiums = Object.keys(page).filter((font) => typeof offThere === "object" && offPage[font] !== offThere[font]);
    if (chromiums.length) result.notes.push(`${where}: ${chromiums.join(", ")} differ from the page with the protection off too (Chromium on this system)`);
    const differ = Object.keys(page).filter((font) => !chromiums.includes(font) && page[font] !== there[font]);
    if (differ.length) problems.push(`fonts in ${where}: ${differ.map((font) => `${font} ${there[font]} (the page: ${page[font]})`).join(", ")}`);
  }
  result.problems = problems;
  console.log(JSON.stringify(result, null, 2));
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
