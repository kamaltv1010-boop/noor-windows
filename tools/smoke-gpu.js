// Noor's WebGL Vendor & Renderer (see main/gpus.js): launches the app, and
// checks that a page and its worker see the profile's graphics card in
// WebGL (only once they asked for WEBGL_debug_renderer_info) and WebGPU,
// that another profile sees its own, that New makes another, and that with
// the switch off a page sees this PC's own.
// Needs Playwright and a display: on Linux, `xvfb-run -a node tools/smoke-gpu.js`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const { graphicsOf } = require(path.join(root, "main", "gpus"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PROBE = `(async () => {
  const gl = document.createElement("canvas").getContext("webgl");
  const out = { before: gl.getParameter(0x9246) };
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  out.vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
  out.renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  out.gl2 = (() => { const g = document.createElement("canvas").getContext("webgl2"); g.getExtension("WEBGL_debug_renderer_info"); return g.getParameter(0x9246); })();
  out.wrongThis = (() => { try { WebGLRenderingContext.prototype.getParameter.call({}, 0x9246); return "no throw"; } catch (e) { return e.constructor.name; } })();
  out.toStr = Function.prototype.toString.call(WebGLRenderingContext.prototype.getParameter);
  out.worker = await new Promise((resolve) => {
    const code = "const gl = new OffscreenCanvas(1, 1).getContext('webgl'); const e = gl.getExtension('WEBGL_debug_renderer_info'); postMessage(gl.getParameter(e.UNMASKED_RENDERER_WEBGL));";
    const worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
    worker.onmessage = (event) => resolve(event.data);
    worker.onerror = (event) => resolve("error " + event.message);
    setTimeout(() => resolve("timeout"), 5000);
  });
  out.webgpu = !navigator.gpu ? "no navigator.gpu" : await Promise.race([
    navigator.gpu.requestAdapter().then((a) => (a ? { vendor: a.info.vendor, architecture: a.info.architecture, device: a.info.device, description: a.info.description } : "no adapter"), (e) => "error " + e.message),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 5000)),
  ]);
  return out;
})()`;

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end("<!doctype html><title>gpu</title><p>gpu</p>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const app = await electron.launch({
    executablePath: require(path.join(root, "node_modules", "electron")),
    args: [root, "--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--enable-unsafe-webgpu"],
    env: { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), "noor-gpu-")), NOOR_TEST_TIMEZONE: "America/New_York" },
  });
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected))) break;
    await sleep(100);
  }
  const probe = async () => {
    await main((electron, url) => { global.noorTest.browser.newTab({ url }); }, base);
    for (let i = 0; i < 100; i++) {
      if (!(await main(() => global.noorTest.browser.selected.webContents.isLoading()))) break;
      await sleep(100);
    }
    await sleep(500);
    return main((electron, code) => global.noorTest.browser.selected.webContents.executeJavaScript(code, true), PROBE);
  };
  const card = () => main(() => global.noorTest.browser.fingerprint.gpu());

  const failures = [];
  const check = (name, ok, detail) => { if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`); };
  const sees = (name, seen, gpu) => {
    const told = graphicsOf(gpu);
    check(`${name}: WebGL`, seen.before === null && seen.vendor === told.vendor && seen.renderer === told.renderer && seen.gl2 === told.renderer && seen.worker === told.renderer, { seen, told });
    check(`${name}: as the browser's own`, seen.wrongThis === "TypeError" && /\[native code\]/.test(seen.toStr), seen);
    // (Where this PC gives WebGPU no adapter there is nothing to tell.)
    if (seen.webgpu && typeof seen.webgpu === "object") {
      check(`${name}: WebGPU`, seen.webgpu.vendor === told.webgpu.vendor && seen.webgpu.architecture === told.webgpu.architecture && seen.webgpu.device === "" && seen.webgpu.description === "", seen.webgpu);
    }
  };

  const first = await card();
  const firstSeen = await probe();
  sees("first profile", firstSeen, first);
  // New: another card.
  await main(() => global.noorTest.browser.newFingerprint(["gpu"]));
  const renewed = await card();
  check("New makes another card", renewed.name !== first.name, { first, renewed });
  sees("after New", await probe(), renewed);
  // Another profile: its own card.
  await main(() => global.noorTest.browser.createProfile("Second"));
  await sleep(800);
  const second = await card();
  sees("second profile", await probe(), second);
  // Off: this PC's own card.
  await main(() => global.noorTest.context.fingerprint.setEnabled("gpu", false));
  await sleep(300);
  const off = await probe();
  check("off: this PC's own card", off.renderer !== graphicsOf(second).renderer && !/Direct3D11/.test(String(off.renderer)), off);

  console.log(JSON.stringify({ first: graphicsOf(first).renderer, renewed: graphicsOf(renewed).renderer, second: graphicsOf(second).renderer, off: off.renderer, webgpu: firstSeen.webgpu, failures }, null, 2));
  await app.close().catch(() => {});
  server.close();
  process.exit(failures.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
