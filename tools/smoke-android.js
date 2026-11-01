// Runs Noor Android as a user does (no test tool attached to its browser:
// started on its own, then handed a page as a second launch hands it an
// address), opens a page in it and checks what a site sees there: Chrome
// on an Android phone (or with "tablet", a tablet; "phone <n>" or
// "tablet <n>", the n-th of the list), in the page, its frames, its
// workers, a window it opens and the requests it makes. SMOKE_GPU=off
// checks a profile whose WebGL Vendor & Renderer is off (this PC's card).
// Needs a display: on Linux, `xvfb-run -a node tools/smoke-android.js [phone|tablet [<n>]]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const electronPath = require(path.join(root, "node_modules", "electron"));
const { PHONES, TABLETS, CATALOG, graphicsOf, fontsOf } = require(path.join(root, "main", "android"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const FAMILY = process.argv[2] === "tablet" ? "tablet" : "phone";
const LIST = FAMILY === "tablet" ? TABLETS : PHONES;
const INDEX = process.argv[3] !== undefined ? Number(process.argv[3]) : FAMILY === "tablet" ? 0 : 7;
const device = LIST[INDEX];
const GPU_ON = process.env.SMOKE_GPU !== "off";
const graphics = graphicsOf(device);
// The profile's fonts seed, and a Noto font its Android has and one it lacks.
const FONTS_SEED = 123456789;
const profileFonts = fontsOf(FONTS_SEED);
const NOTO = { has: profileFonts.add[0][0], lacks: profileFonts.block[0] };

/// What a worker tells of itself (a shared worker and a service worker
/// answer a message with it).
const WORKER_VALUES = "({ ua: navigator.userAgent, platform: navigator.platform, hc: navigator.hardwareConcurrency, dm: navigator.deviceMemory, uad: navigator.userAgentData ? navigator.userAgentData.platform + '/' + navigator.userAgentData.mobile : 'none', hid: 'HID' in self })";

const PROBE = String.raw`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>probe</title></head><body><div id="box"></div><script>
(async () => {
const report = (body) => fetch("/report", { method: "POST", body: JSON.stringify(body) });
const out = {};
const tryv = (fn) => { try { return fn(); } catch (e) { return "ERR " + e.message; } };
const n = navigator;
out.nav = { ua: n.userAgent, platform: n.platform, vendor: n.vendor, hc: n.hardwareConcurrency, dm: n.deviceMemory, mtp: n.maxTouchPoints, webdriver: n.webdriver,
  plugins: n.plugins.length, mimeTypes: n.mimeTypes.length, pdf: n.pdfViewerEnabled, pluginsTag: Object.prototype.toString.call(n.plugins), pluginItem: n.plugins.item(0),
  connectionType: n.connection && n.connection.type, contacts: typeof n.contacts, contactsTag: n.contacts && Object.prototype.toString.call(n.contacts), langs: n.languages };
out.uad = n.userAgentData ? { platform: n.userAgentData.platform, mobile: n.userAgentData.mobile, brands: n.userAgentData.brands.map((b) => b.brand).join("|"),
  high: await n.userAgentData.getHighEntropyValues(["model", "platformVersion", "architecture", "bitness", "formFactors", "fullVersionList"]) } : null;
out.screen = { w: screen.width, h: screen.height, aw: screen.availWidth, ah: screen.availHeight, o: screen.orientation && screen.orientation.type, angle: screen.orientation && screen.orientation.angle };
out.win = { iw: innerWidth, ih: innerHeight, ow: outerWidth, oh: outerHeight, dpr: devicePixelRatio, orientation: window.orientation, touch: "ontouchstart" in window };
out.mq = Object.fromEntries(["(pointer: coarse)", "(hover: none)", "(any-hover: hover)", "(orientation: portrait)", "(dynamic-range: high)"].map((q) => [q, matchMedia(q).matches]));
out.gone = Object.fromEntries(["HID", "EyeDropper", "queryLocalFonts", "documentPictureInPicture", "launchQueue", "ScreenDetails", "LanguageModel"].map((k) => [k, k in window]));
out.goneNav = { hid: "hid" in n, setAppBadge: "setAppBadge" in n, registerProtocolHandler: "registerProtocolHandler" in n, getDisplayMedia: !!(n.mediaDevices && "getDisplayMedia" in n.mediaDevices) };
out.webgl = tryv(() => { const gl = document.createElement("canvas").getContext("webgl"); const before = gl.getParameter(0x9246); const d = gl.getExtension("WEBGL_debug_renderer_info");
  return { before, vendor: gl.getParameter(d.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(d.UNMASKED_RENDERER_WEBGL), maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE), s3tc: gl.getExtension("WEBGL_compressed_texture_s3tc"), exts: gl.getSupportedExtensions().length }; });
await new Promise((r) => { if (speechSynthesis.getVoices().length) r(); else { speechSynthesis.onvoiceschanged = r; setTimeout(r, 1500); } });
out.voices = tryv(() => { const v = speechSynthesis.getVoices(); return { count: v.length, first: v.slice(0, 2).map((x) => [x.name, x.lang, x.voiceURI]), defaults: v.filter((x) => x.default).map((x) => x.name) }; });
const box = document.getElementById("box");
const width = (family) => { const s = document.createElement("span"); s.style.fontSize = "48px"; s.textContent = "mmMwWLliI0fiflO&1"; s.style.fontFamily = family; box.appendChild(s); const w = s.offsetWidth; box.removeChild(s); return w; };
const base = width("monospace");
report({ step: "fonts" });
const noto = await fetch("/noto.json").then((r) => r.json());
out.fonts = Object.fromEntries(["Calibri", "Segoe UI", "Consolas", "Roboto", "sans-serif-thin", "Noto Serif", "Arial", "Droid Sans Mono", noto.has, noto.lacks].map((f) => [f, width("'" + f + "', monospace") !== base]));
out.localFonts = {};
for (const f of [noto.has, noto.lacks]) out.localFonts[f] = await Promise.race([new FontFace("probe " + f, "local('" + f + "')").load().then(() => true, () => false), new Promise((r) => setTimeout(() => r("timeout"), 3000))]);
out.fontSet = { size: document.fonts.size, status: document.fonts.status };
out.webgpu = await (async () => {
  if (!navigator.gpu) return "no navigator.gpu";
  const adapter = await Promise.race([navigator.gpu.requestAdapter().catch((e) => null), new Promise((r) => setTimeout(() => r(null), 5000))]);
  if (!adapter) return "no adapter";
  const i = adapter.info;
  return { vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description, subgroupMinSize: i.subgroupMinSize, subgroupMaxSize: i.subgroupMaxSize, tag: Object.prototype.toString.call(i),
    wrongThis: (() => { try { Object.getOwnPropertyDescriptor(GPUAdapterInfo.prototype, "vendor").get.call({}); return "no error"; } catch (e) { return e.constructor.name; } })() };
})().catch((e) => "ERR " + e.message);
out.battery = await n.getBattery().then((b) => ({ level: b.level, charging: b.charging })).catch((e) => "ERR " + e.message);
report({ step: "workers" });
out.worker = await new Promise((resolve) => { const wk = new Worker("/worker.js"); wk.onmessage = (e) => resolve(e.data); wk.onerror = (e) => resolve("ERR " + e.message); setTimeout(() => resolve("timeout"), 5000); });
out.shared = await new Promise((resolve) => { const s = new SharedWorker("/shared.js"); s.port.onmessage = (e) => resolve(e.data); s.port.start(); s.port.postMessage(1); setTimeout(() => resolve("timeout"), 8000); });
report({ step: "service" });
out.service = await Promise.race([(async () => {
  const registration = await navigator.serviceWorker.register("/sw.js");
  const worker = registration.active || registration.installing || registration.waiting;
  if (worker.state !== "activated") await new Promise((r) => worker.addEventListener("statechange", () => worker.state === "activated" && r()));
  const channel = new MessageChannel();
  const answer = new Promise((resolve) => { channel.port1.onmessage = (e) => resolve(e.data); });
  worker.postMessage(1, [channel.port2]);
  return answer;
})().catch((e) => "ERR " + e), new Promise((r) => setTimeout(() => r("timeout"), 10000))]);
report({ step: "frame" });
out.frame = await new Promise((resolve) => { addEventListener("message", (e) => { if (e.data && e.data.frame) resolve(e.data.frame); }); const f = document.createElement("iframe"); f.src = "http://localhost:" + location.port + "/frame"; document.body.appendChild(f); setTimeout(() => resolve("timeout"), 5000); });
report({ step: "popup" });
out.popup = await new Promise((resolve) => { addEventListener("message", (e) => { if (e.data && e.data.popup) resolve(e.data.popup); }); window.open("/popup", "_blank"); setTimeout(() => resolve("timeout"), 8000); });
await fetch("/hinted").catch(() => {});
out.done = true;
await report(out);
})().catch((e) => fetch("/report", { method: "POST", body: JSON.stringify({ done: true, error: String(e && e.stack || e) }) }));
</script></body></html>`;

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
  headers[url] = headers[url] || req.headers;
  const send = (type, body, extra = {}) => {
    res.setHeader("content-type", type);
    res.setHeader("cache-control", "no-store");
    for (const [name, value] of Object.entries(extra)) res.setHeader(name, value);
    res.end(body);
  };
  if (url === "/worker.js") return send("text/javascript", `onmessage = () => postMessage(${WORKER_VALUES}); postMessage(${WORKER_VALUES});`);
  if (url === "/shared.js") return send("text/javascript", `onconnect = (e) => { const port = e.ports[0]; port.onmessage = () => port.postMessage(${WORKER_VALUES}); };`);
  if (url === "/sw.js") return send("text/javascript", `self.addEventListener("install", () => self.skipWaiting()); self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim())); self.addEventListener("message", (e) => e.ports[0].postMessage(${WORKER_VALUES}));`);
  if (url === "/frame" || url === "/popup") {
    const key = url.slice(1);
    return send("text/html; charset=utf-8", `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><script>(${key === "popup" ? "opener" : "parent"}).postMessage({ ${key}: { ua: navigator.userAgent, platform: navigator.platform, mtp: navigator.maxTouchPoints, sw: screen.width, dpr: devicePixelRatio, uad: navigator.userAgentData.platform, plugins: navigator.plugins.length, hid: "HID" in window } }, "*");</script>`);
  }
  if (url === "/noto.json") return send("application/json", JSON.stringify(NOTO));
  if (url === "/probe") return send("text/html; charset=utf-8", PROBE, { "accept-ch": "Sec-CH-UA-Model, Sec-CH-UA-Platform-Version, Sec-CH-UA-Form-Factors" });
  send("text/plain", "ok");
});

const failures = [];
const check = (name, ok, detail) => {
  if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`);
};

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const env = { ...process.env, NOOR_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), "noor-android-smoke-")), NOOR_DEVICE: "android", NOOR_TEST_OPEN_WINDOWS: "1" };
  delete env.NOOR_TEST;
  fs.writeFileSync(path.join(env.NOOR_USER_DATA, "settings.json"), JSON.stringify({ "device.family": FAMILY, "seed.device": INDEX, "device.catalog": CATALOG, "seed.fonts": FONTS_SEED, "protection.gpu": GPU_ON }));
  const args = [root, "--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--enable-unsafe-webgpu"];
  const first = spawn(electronPath, args, { env, stdio: process.env.SMOKE_LOG ? ["ignore", fs.openSync(process.env.SMOKE_LOG, "w"), fs.openSync(process.env.SMOKE_LOG, "a")] : "ignore" });
  await sleep(7000);
  const second = spawn(electronPath, [...args, `http://127.0.0.1:${port}/probe`], { env, stdio: "ignore" });
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
  const phone = FAMILY === "phone";
  const UA = phone
    ? /^Mozilla\/5\.0 \(Linux; Android 10; K\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\d+\.0\.0\.0 Mobile Safari\/537\.36$/
    : /^Mozilla\/5\.0 \(Linux; Android 10; K\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/;
  const ua = r.nav.ua;
  check("user agent", UA.test(ua), ua);
  check("navigator", r.nav.platform === device.platform && r.nav.vendor === "Google Inc." && r.nav.hc === device.cores && r.nav.dm === device.memory && r.nav.mtp === device.touchPoints && r.nav.webdriver === false, r.nav);
  check("no plugins, no PDF viewer", r.nav.plugins === 0 && r.nav.mimeTypes === 0 && r.nav.pdf === false && r.nav.pluginsTag === "[object PluginArray]" && r.nav.pluginItem === null, r.nav);
  check("network, contacts", r.nav.connectionType === "wifi" && r.nav.contacts === "object" && r.nav.contactsTag === "[object ContactsManager]", r.nav);
  check("client hints", r.uad && r.uad.platform === "Android" && r.uad.mobile === phone && r.uad.high.model === device.model && r.uad.high.platformVersion === `${device.android}.0.0` && r.uad.high.architecture === "" && r.uad.high.formFactors.join() === (phone ? "Mobile" : "Tablet") && /Google Chrome/.test(r.uad.brands), r.uad);
  check("screen and window", r.screen.w === device.width && r.screen.h === device.height && r.win.iw === device.pageWidth && r.win.ih === device.pageHeight && r.win.dpr === device.scale && r.win.ow === device.pageWidth && r.win.oh === device.outerHeight && r.win.touch && r.win.orientation === 0 && r.screen.o === (phone ? "portrait-primary" : "landscape-primary") && r.screen.angle === 0, { screen: r.screen, win: r.win });
  check("media queries", r.mq["(pointer: coarse)"] && r.mq["(hover: none)"] && !r.mq["(any-hover: hover)"] && r.mq["(orientation: portrait)"] === phone && r.mq["(dynamic-range: high)"] === device.hdr, r.mq);
  check("what Chrome on Android lacks", Object.values(r.gone).every((v) => v === false) && Object.values(r.goneNav).every((v) => v === false), { gone: r.gone, nav: r.goneNav });
  if (GPU_ON) {
    check("WebGL as the device's processor's graphics", r.webgl && r.webgl.before === null && r.webgl.vendor === graphics.vendor && r.webgl.renderer === graphics.renderer && r.webgl.s3tc === null && r.webgl.maxTex <= (graphics.family === "mali" ? 8192 : 16384), r.webgl);
    // (Where this PC gives WebGPU no adapter there is nothing to tell.)
    if (r.webgpu && typeof r.webgpu === "object") {
      check("WebGPU as the same card", r.webgpu.vendor === graphics.webgpu.vendor && r.webgpu.architecture === graphics.webgpu.architecture && r.webgpu.device === "" && r.webgpu.description === "" && r.webgpu.subgroupMinSize === graphics.webgpu.subgroupMinSize && r.webgpu.subgroupMaxSize === graphics.webgpu.subgroupMaxSize && r.webgpu.tag === "[object GPUAdapterInfo]" && r.webgpu.wrongThis === "TypeError", r.webgpu);
    }
  } else {
    check("WebGL as this PC's (WebGL Vendor & Renderer off)", r.webgl && r.webgl.renderer !== graphics.renderer && !/Adreno|Mali/.test(String(r.webgl.renderer)) && r.webgl.vendor !== graphics.vendor, r.webgl);
  }
  check("Android's voices", r.voices.count > 50 && r.voices.first[0][0] === "Arabic" && r.voices.defaults.length === 1, r.voices);
  check("Windows fonts hidden, Android's there, the page's font list as its own", !r.fonts.Calibri && !r.fonts["Segoe UI"] && !r.fonts.Consolas && r.fonts.Roboto && r.fonts["sans-serif-thin"] && r.fonts["Noto Serif"] && r.fonts.Arial && r.fonts["Droid Sans Mono"] && r.fontSet.size === 0 && r.fontSet.status === "loaded", { fonts: r.fonts, set: r.fontSet });
  check("the profile's own Noto fonts: one it has found, one it lacks not", r.fonts[NOTO.has] === true && r.fonts[NOTO.lacks] === false && r.localFonts[NOTO.has] === true && r.localFonts[NOTO.lacks] === false, { noto: NOTO, fonts: r.fonts, local: r.localFonts });
  check("battery", r.battery && typeof r.battery.level === "number" && r.battery.level >= 0.35 && r.battery.level <= 0.95, r.battery);
  // (Chromium gives a worker Web HID, as what a secure context alone has,
  // after the protection ran: it is taken away as the worker's own script
  // is about to run, see Tab.atScriptStart.)
  for (const [name, w] of [["worker", r.worker], ["shared worker", r.shared], ["service worker", r.service]]) {
    check(name, w && w.ua === ua && w.platform === device.platform && w.hc === device.cores && w.dm === device.memory && w.uad === `Android/${phone}` && w.hid === false, w);
  }
  for (const [name, f] of [["frame of another site", r.frame], ["window the page opens", r.popup]]) {
    check(name, f && f.ua === ua && f.platform === device.platform && f.mtp === device.touchPoints && f.sw === device.width && f.dpr === device.scale && f.uad === "Android" && f.plugins === 0 && f.hid === false, f);
  }
  const nav = headers["/probe"] || {};
  check("navigation headers", nav["sec-ch-ua-platform"] === '"Android"' && nav["sec-ch-ua-mobile"] === (phone ? "?1" : "?0") && /Google Chrome/.test(nav["sec-ch-ua"] || "") && nav["user-agent"] === ua, nav);
  const hinted = headers["/hinted"] || {};
  check("hints a site asked for", hinted["sec-ch-ua-model"] === `"${device.model}"` && hinted["sec-ch-ua-platform-version"] === `"${device.android}.0.0"` && hinted["sec-ch-ua-platform"] === '"Android"', hinted);
  console.log(JSON.stringify({ device: device.name, userAgent: ua, platform: r.nav.platform, model: r.uad && r.uad.high.model, screen: [r.screen.w, r.screen.h, r.win.dpr], page: [r.win.iw, r.win.ih], cores: r.nav.hc, webgl: r.webgl && [r.webgl.vendor, r.webgl.renderer], webgpu: r.webgpu, noto: NOTO, failures }, null, 2));
  process.exit(failures.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
