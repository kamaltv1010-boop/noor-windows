// What WebGPU's adapter tells of the graphics card, in a page and in its
// dedicated worker, in a build of Noor: Noor's profile card ("nvidia",
// "ampere"…, main/gpus.js), Noor Android's device card ("qualcomm",
// "adreno-7xx"…, main/android.js), Noor iPhone's Safari on iOS 26 ("apple"
// for all four names, subgroups 32 wide); and the canvas format each
// prefers (Chrome on Android "rgba8unorm", Safari "bgra8unorm"; Noor keeps
// Chromium's own, checked on Windows only). A worker gets WebGPU after the
// protection ran in it (Chromium adds what a secure context alone has
// late), so it must be named there too. Exits 1 if the page or the worker
// tells this computer's card.
// Needs Playwright and a display: `xvfb-run -a node tools/probe-webgpu.js [windows|iphone|android]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const BUILD = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const READ = "navigator.gpu ? Promise.race([navigator.gpu.requestAdapter().then((a) => a ? { vendor: a.info.vendor, architecture: a.info.architecture, device: a.info.device, description: a.info.description, sub: [a.info.subgroupMinSize, a.info.subgroupMaxSize], format: navigator.gpu.getPreferredCanvasFormat() } : 'no adapter', (e) => 'ERR ' + e.message), new Promise((r) => setTimeout(() => r('timeout'), 6000))]) : Promise.resolve('none')";
const PROBE = `(async () => ({
  page: await (${READ}),
  worker: await new Promise((resolve) => {
    const w = new Worker(URL.createObjectURL(new Blob(["(" + ${JSON.stringify(READ)} + ").then((v) => postMessage(v))"], { type: "text/javascript" })));
    w.onmessage = (e) => resolve(e.data);
    w.onerror = (e) => resolve("ERR " + e.message);
    setTimeout(() => resolve("timeout"), 8000);
  }),
}))()`;

(async () => {
  const web = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end("<!doctype html><title>webgpu</title><body><p>webgpu</p></body>");
  });
  await new Promise((resolve) => web.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${web.address().port}/`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-webgpu-"));
  // Noor iPhone: an iPhone on iOS 26 (Safari has WebGPU from there).
  if (BUILD === "iphone") {
    const { IPHONES } = require(path.join(root, "main", "iphone"));
    fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ "device.family": "iphone", "seed.device": IPHONES.findIndex((d) => /^26/.test(d.iOS)) }));
  }
  const app = await electron.launch({
    executablePath: require(path.join(root, "node_modules", "electron")),
    args: [root, "--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--enable-unsafe-webgpu"],
    env: { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: userData, NOOR_DEVICE: BUILD, NOOR_TEST_TIMEZONE: "Africa/Casablanca" },
  });
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  // What the profile's card is: its card (Noor), its device (Noor Android).
  const own = await main((electron, build) => {
    const fingerprint = global.noorTest.browser.fingerprint;
    return build === "windows" ? fingerprint.gpu() : build === "android" ? fingerprint.iphone() : null;
  }, BUILD);
  let expected;
  if (BUILD === "iphone") {
    expected = { vendor: "apple", architecture: "apple", device: "apple", description: "apple", sub: [32, 32], format: "bgra8unorm" };
  } else if (BUILD === "android") {
    const graphics = require(path.join(root, "main", "android")).graphicsOf(own).webgpu;
    // (Chrome on Android prefers RGBA for a canvas.)
    expected = { vendor: graphics.vendor, architecture: graphics.architecture, device: "", description: "", sub: [graphics.subgroupMinSize, graphics.subgroupMaxSize], format: "rgba8unorm" };
  } else {
    const graphics = require(path.join(root, "main", "gpus")).graphicsOf(own).webgpu;
    expected = { vendor: graphics.vendor, architecture: graphics.architecture, device: "", description: "" };
    // (Noor leaves the canvas format Chromium's own: BGRA on Windows, as
    // Chrome there, but RGBA where this check may run, on Linux.)
    if (process.platform === "win32") expected.format = "bgra8unorm";
  }
  await main((electron, url) => { global.noorTest.browser.newTab({ url }); }, base);
  await sleep(2500);
  const seen = await main((electron, code) => global.noorTest.browser.selected.webContents.executeJavaScript(code, true), PROBE);
  await app.close().catch(() => {});
  web.close();
  const problems = [];
  for (const where of ["page", "worker"]) {
    const value = seen[where];
    if (typeof value !== "object") { problems.push(`${where}: ${value}`); continue; }
    for (const key of Object.keys(expected)) {
      if (JSON.stringify(value[key]) !== JSON.stringify(expected[key])) problems.push(`${where}: ${key} is ${JSON.stringify(value[key])}, not ${JSON.stringify(expected[key])}`);
    }
  }
  console.log(JSON.stringify({ build: BUILD, expected, seen, problems }, null, 2));
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
