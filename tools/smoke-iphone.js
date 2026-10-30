// Runs Noor iPhone as a user does (no test tool attached to its browser:
// started on its own, then handed a page as a second launch hands it an
// address), opens tools/smoke-iphone.html in it and checks what a site
// sees there: Safari on an iPhone, in the page, its frames, its workers,
// a window it opens and the requests it makes.
// Needs a display: on Linux, `xvfb-run -a node tools/smoke-iphone.js`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const electronPath = require(path.join(root, "node_modules", "electron"));
const PROBE = fs.readFileSync(path.join(__dirname, "smoke-iphone.html"), "utf8");
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/// What a worker tells of itself (a shared worker and a service worker
/// answer a message with it).
const WORKER_VALUES = "({ ua: navigator.userAgent, platform: navigator.platform, hc: navigator.hardwareConcurrency, dm: navigator.deviceMemory, uad: typeof navigator.userAgentData, langs: navigator.languages, toString: Function.prototype.toString.call(Function.prototype.toString), temporal: typeof self.Temporal })";

const reports = [];
const headers = {};
const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  if (req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { reports.push(JSON.parse(body)); } catch (error) { reports.push({ bad: body.slice(0, 200) }); }
      res.end("ok");
    });
    return;
  }
  headers[url] = headers[url] || req.rawHeaders;
  const send = (type, body) => {
    res.setHeader("content-type", type);
    res.setHeader("cache-control", "no-store");
    res.end(body);
  };
  if (url === "/pixel.png") return send("image/png", PIXEL);
  if (url === "/style.css") return send("text/css", "body{}");
  if (url === "/script.js") return send("text/javascript", "window.scriptLoaded = true;");
  if (url === "/worker.js") {
    return send("text/javascript", `self.onmessage = () => { let fonts = null; try { const c = new OffscreenCanvas(10, 10).getContext("2d"); const w = (f) => { c.font = "40px " + f; return c.measureText("mmmMMMwwwlli").width; }; fonts = { base: w("monospace"), calibri: w("'Calibri', monospace") }; } catch (e) { fonts = String(e); } postMessage(Object.assign(${WORKER_VALUES}, { fonts })); };`);
  }
  if (url === "/shared.js") return send("text/javascript", `onconnect = (e) => { const port = e.ports[0]; port.onmessage = () => port.postMessage(${WORKER_VALUES}); };`);
  if (url === "/sw.js") {
    return send("text/javascript", `self.addEventListener("install", () => self.skipWaiting()); self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim())); self.addEventListener("message", (e) => e.ports[0].postMessage(${WORKER_VALUES}));`);
  }
  if (url === "/frame" || url === "/popup") {
    const key = url.slice(1);
    return send("text/html; charset=utf-8", `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><script>(${key === "popup" ? "opener" : "parent"}).postMessage({ ${key}: { mtp: navigator.maxTouchPoints, touch: "ontouchstart" in window, coarse: matchMedia("(pointer: coarse)").matches, dpr: devicePixelRatio, sw: screen.width, sh: screen.height, ua: navigator.userAgent, vendor: navigator.vendor, hc: navigator.hardwareConcurrency, uad: typeof navigator.userAgentData, chrome: typeof window.chrome, toString: Function.prototype.toString.call(Function.prototype.toString), dw: matchMedia("(device-width: " + screen.width + "px)").matches } }, "*");</script>`);
  }
  send("text/html; charset=utf-8", PROBE);
});

const failures = [];
const check = (name, ok, detail) => {
  if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`);
};

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const env = { ...process.env, NOOR_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), "noor-iphone-smoke-")), NOOR_DEVICE: "iphone" };
  delete env.NOOR_TEST;
  const args = [root, "--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"];
  const first = spawn(electronPath, args, { env, stdio: process.env.SMOKE_LOG ? ["ignore", fs.openSync(process.env.SMOKE_LOG, "w"), fs.openSync(process.env.SMOKE_LOG, "a")] : "ignore" });
  await sleep(7000);
  const second = spawn(electronPath, [...args, `http://127.0.0.1:${port}/probe?port=${port}`], { env, stdio: "ignore" });
  await new Promise((resolve) => second.on("exit", resolve));
  const until = Date.now() + 90000;
  while (!reports.some((r) => r.done) && Date.now() < until) await sleep(250);
  first.kill();
  server.close();
  const r = reports.find((x) => x.done);
  if (!r) {
    console.error("No report from the page", JSON.stringify(reports).slice(0, 500), Object.keys(headers).join(" "));
    process.exit(1);
  }
  if (r.error) {
    console.error("The page failed:", r.error);
    process.exit(1);
  }
  const ua = r.nav.ua;
  check("user agent", /^Mozilla\/5\.0 \(iPhone; CPU iPhone OS [\d_]+ like Mac OS X\) AppleWebKit\/605\.1\.15 \(KHTML, like Gecko\) Version\/[\d.]+ Mobile\/15E148 Safari\/604\.1$/.test(ua), ua);
  check("navigator", r.nav.platform === "iPhone" && r.nav.vendor === "Apple Computer, Inc." && r.nav.hc === 4 && r.nav.dm === undefined && r.nav.mtp === 5 && r.nav.langs.length === 1 && r.nav.standalone === false && !r.nav.uad && !r.nav.connection && !r.nav.battery && r.nav.webdriver === false, r.nav);
  check("engine as FingerprintJS tells it", r.fpjs.isWebKit && !r.fpjs.isChromium && !r.fpjs.isDesktopWebKit && r.fpjs.isSafariWebKit, r.fpjs);
  check("engine as BotD tells it", r.botd.evalLength === 37 && r.botd.engineWebKit && !r.botd.mismatch, r.botd);
  check("engine as CreepJS tells it", r.creepEngine === 77, r.creepEngine);
  check("built-ins print as Safari's", r.toStrings.fn === "function toString() {\n    [native code]\n}" && r.toStrings.getter === "function width() {\n    [native code]\n}" && r.toStrings.stackLimit === 100, r.toStrings);
  const NEVER = ["chrome", "Notification", "MediaSource", "SourceBuffer", "requestIdleCallback", "scheduler", "Temporal", "showOpenFilePicker", "queryLocalFonts", "BatteryManager", "NetworkInformation", "NavigatorUAData", "webkitRequestFileSystem", "webkitSpeechGrammar", "SharedStorage", "documentPictureInPicture", "originAgentCluster", "onbeforeinstallprompt"];
  check("Chrome's own taken away", NEVER.every((name) => r.chromeOnly[name] === false), r.chromeOnly);
  check("Safari's own there", ["ApplePayError", "CSSPrimitiveValue", "Counter", "RGBColor", "WebKitMediaKeys", "GestureEvent", "ongesturestart", "orientation", "ontouchstart"].every((name) => r.webkitOnly[name]), r.webkitOnly);
  check("full screen through the video only", !r.elements.requestFullscreen && r.elements.webkitEnterFullscreen && r.elements.touchCallout, r.elements);
  check("screen and window", r.screen.w === r.win.ow && r.screen.h === r.win.oh && r.screen.ah === r.screen.h && r.win.iw === r.screen.w && [2, 3].includes(r.win.dpr) && r.win.orientation === 0 && !r.screen.isExtended, { screen: r.screen, win: r.win });
  check("media queries", r.mq["(pointer: coarse)"] && r.mq["(hover: none)"] && r.mq["(color-gamut: p3)"] && r.mq[`(device-width: ${r.screen.w}px)`], r.mq);
  check("clocks to the millisecond", r.clocks.nowFrac === 0 && r.clocks.event === 0, r.clocks);
  const gl = r.webgl && r.webgl.webgl;
  check("WebGL as an iPhone's", gl && gl.version === "WebGL 1.0" && gl.sl === "WebGL GLSL ES 1.0 (1.0)" && gl.unmaskedBefore === null && gl.uv === "Apple Inc." && gl.ur === "Apple GPU" && !gl.s3tc && gl.point[1] <= 511, gl);
  check("an iPhone's voices", r.voices.count > 40 && r.voices.first[0][2].indexOf("com.apple.") === 0, r.voices);
  check("Windows fonts hidden, the page's font list as its own", !r.fonts.Calibri && !r.fonts["Segoe UI"] && !r.fonts.Consolas && !r.fonts["DejaVu Sans"] && r.fontSet.size === 0 && r.fontSet.status === "loaded" && r.fontLoads["DejaVu Sans"] === "NetworkError", { fonts: r.fonts, set: r.fontSet, loads: r.fontLoads });
  check("permissions as Safari answers", r.permissions.camera === "prompt" && /^TypeError/.test(r.permissions["clipboard-read"]), r.permissions);
  for (const [name, w] of [["worker", r.worker], ["shared worker", r.shared], ["service worker", r.service]]) {
    check(name, w && w.ua === ua && w.platform === "iPhone" && w.hc === 4 && w.dm === undefined && w.uad === "undefined" && w.temporal === "undefined" && w.toString === "function toString() {\n    [native code]\n}", w);
  }
  check("worker canvas fonts", r.worker.fonts && r.worker.fonts.calibri === r.worker.fonts.base, r.worker.fonts);
  for (const [name, f] of [["frame of another site", r.frame], ["window the page opens", r.popup]]) {
    check(name, f && f.mtp === 5 && f.touch && f.coarse && f.dpr === r.win.dpr && f.sw === r.screen.w && f.ua === ua && f.vendor === "Apple Computer, Inc." && f.uad === "undefined" && f.chrome === "undefined" && f.dw, f);
  }
  const navigation = headers["/probe"] || [];
  const names = navigation.filter((v, i) => i % 2 === 0).map((n) => n.toLowerCase());
  check("navigation headers", !names.some((n) => n.startsWith("sec-ch-") || n === "sec-fetch-user" || n === "upgrade-insecure-requests") && navigation[navigation.indexOf("Accept") + 1] === "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", navigation);
  const image = headers["/pixel.png"] || [];
  check("image headers", /^image\/webp,image\/avif/.test(image[image.indexOf("Accept") + 1] || ""), image);
  console.log(JSON.stringify({ iphone: ua, screen: [r.screen.w, r.screen.h, r.win.dpr], failures }, null, 2));
  process.exit(failures.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
