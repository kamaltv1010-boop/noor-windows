// Runs Noor and looks for fonts the way sites do: the width of text asked
// in a font (in the page, a canvas and a worker's canvas), FontFace's
// local(), the page's font list. Fonts that aren't Windows' own must not
// be found; a page's own web fonts and Windows' fonts work as before.
// First Noor lists this computer's fonts itself (see main/fonts.js); then
// it is given a list (Inter and JetBrains Mono, fonts of this test
// computer's that no Windows has, and Arial) and pages are looked at.
// Needs Playwright and a display: on Linux, `xvfb-run -a node tools/smoke-fonts.js`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const FACES = [
  ["Inter", "Inter", "Inter-Regular", "Regular"],
  ["Inter", "Inter Bold", "Inter-Bold", "Bold"],
  ["Inter", "Inter Light", "Inter-Light", "Light"],
  ["JetBrains Mono", "JetBrains Mono", "JetBrainsMono-Regular", "Regular"],
  ["JetBrains Mono", "JetBrains Mono Bold", "JetBrainsMono-Bold", "Bold"],
  ["Arial", "Arial", "ArialMT", "Regular"],
];

// What a site measures: each font's text against the fallback's.
const LOOK = `(async () => {
  const text = "mmmmmmmmmmlli WwQq 0123";
  const span = (family) => {
    const element = document.createElement("span");
    element.style.cssText = "position:absolute;left:-9999px;font-size:72px;white-space:nowrap;font-family:" + family;
    element.textContent = text;
    document.body.appendChild(element);
    const size = element.offsetWidth + "x" + element.offsetHeight;
    element.remove();
    return size;
  };
  const context = document.createElement("canvas").getContext("2d");
  const measure = (font) => { context.font = font; return context.measureText(text).width.toFixed(2); };
  const local = (name) => new FontFace("t" + Math.random(), 'local("' + name + '")').load().then(() => "found", (error) => "missing " + error.name);
  const worker = await new Promise((resolve) => {
    const code = "const c = new OffscreenCanvas(10, 10).getContext('2d'); const m = (f) => { c.font = f; return c.measureText('" + text + "').width.toFixed(2); }; postMessage({ inter: m(\\"72px 'Inter', monospace\\"), mono: m('72px monospace'), font: (c.font = \\"72px 'Inter', monospace\\", c.font) });";
    const w = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
    w.onmessage = (event) => resolve(event.data);
    setTimeout(() => resolve("timeout"), 4000);
  });
  // A page's own web font (a font this computer has, as a page gives it).
  const own = new FontFace("Page Own Font", 'local("DejaVu Serif"), local("Liberation Serif"), local("Arial")');
  document.fonts.add(own);
  const ownLoaded = await own.load().then(() => "loaded", (error) => "failed " + error.name);
  const ownSpan = span("'Page Own Font', monospace");
  return {
    mono: span("monospace"), inter: span("'Inter', monospace"), interLight: span("'Inter Light', monospace"), jetbrains: span("'JetBrains Mono', monospace"),
    canvasMono: measure("72px monospace"), canvasInter: measure("72px 'Inter', monospace"),
    localInter: await local("Inter"), localInterBold: await local("Inter Bold"), localPostScript: await local("Inter-Bold"),
    worker,
    fontsSize: document.fonts.size,
    fonts: [...document.fonts].map((face) => face.family).join(","),
    forEach: (() => { const seen = []; document.fonts.forEach((face) => seen.push(face.family)); return seen.join(","); })(),
    hasOwn: document.fonts.has(own),
    check: document.fonts.check('12px "Inter"'),
    status: document.fonts.status,
    ownLoaded, ownSpan,
    constructorLooks: Function.prototype.toString.call(FontFace) + " " + FontFace.name + " " + FontFace.length + " " + (FontFace.prototype.constructor === FontFace) + " " + (own instanceof FontFace),
    notNew: (() => { try { FontFace("x", "local(x)"); return "no throw"; } catch (error) { return error.message; } })(),
  };
})()`;

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end("<!doctype html><title>Fonts</title><p>fonts</p>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const failures = [];
  const check = (name, ok, detail) => {
    if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`);
  };
  const results = {};

  const launch = async (env) => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-fonts-"));
    const app = await electron.launch({
      executablePath: require(path.join(root, "node_modules", "electron")),
      args: [root, "--no-sandbox"],
      env: { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: userData, NOOR_DEVICE: "windows", NOOR_TEST_TIMEZONE: "Africa/Casablanca", ...env },
    });
    app.process().stderr.on("data", (data) => { if (process.env.SMOKE_VERBOSE) process.stderr.write("[electron] " + data); });
    const main = (fn, arg) => app.evaluate(fn, arg);
    for (let i = 0; i < 200; i++) {
      if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
      await sleep(100);
    }
    await sleep(1000);
    return { app, main, userData };
  };

  // Noor lists this computer's fonts itself, from its toolbar, and keeps
  // the list for the next run.
  {
    const run = await launch({});
    let hidden = null;
    for (let i = 0; i < 50 && !hidden; i++) {
      hidden = await run.main(() => (global.noorTest.context.fonts.known ? global.noorTest.context.fonts.hidden().families : null));
      if (!hidden) await sleep(200);
    }
    const kept = fs.existsSync(path.join(run.userData, "fonts.json")) ? JSON.parse(fs.readFileSync(path.join(run.userData, "fonts.json"), "utf8")).faces.length : 0;
    results.listed = { hidden, kept };
    check("this computer's fonts are listed", Array.isArray(hidden) && hidden.includes("Inter") && hidden.includes("JetBrains Mono"), hidden);
    check("the list is kept for the next run", kept > 10, kept);
    await run.app.close();
  }

  // Pages, with Inter and JetBrains Mono to hide.
  {
    const run = await launch({ NOOR_TEST_FONTS: JSON.stringify(FACES) });
    const inTab = (code) => run.main((electron, source) => global.noorTest.browser.selected.webContents.executeJavaScript(source, true), code);
    await run.main((electron, url) => { global.noorTest.browser.newTab({ url }); }, base + "fonts");
    await sleep(2000);
    const page = await inTab(LOOK);
    results.page = page;
    check("Inter isn't found in the page", page.inter === page.mono, page);
    check("nor Inter Light", page.interLight === page.mono, page);
    check("nor JetBrains Mono", page.jetbrains === page.mono, page);
    check("nor in a canvas", page.canvasInter === page.canvasMono, page);
    check("nor in a worker's canvas", page.worker && page.worker.inter === page.worker.mono && page.worker.font === "72px Inter, monospace", page.worker);
    check("nor by local()", /^missing/.test(page.localInterBold) && /^missing/.test(page.localPostScript), page);
    check("the font list has the page's own font only", page.fontsSize === 1 && page.fonts === '"Page Own Font"' && page.forEach === '"Page Own Font"' && page.hasOwn, page);
    check("check() as for any font", page.check === true, page.check);
    check("a page's own font still works", page.ownLoaded === "loaded" && page.ownSpan !== page.mono, page);
    check("FontFace looks as the browser's", page.constructorLooks === "function FontFace() { [native code] } FontFace 2 true true", page.constructorLooks);
    check("FontFace without new is refused as by the browser", page.notNew === "Failed to construct 'FontFace': Please use the 'new' operator, this DOM object constructor cannot be called as a function.", page.notNew);

    // Turned off: the fonts are found again (in the next page).
    await run.main(() => global.noorTest.context.store.set("windowsFontsOnly", false));
    await run.main((electron, url) => { global.noorTest.browser.newTab({ url }); }, base + "fonts-off");
    await sleep(2000);
    const off = await inTab(LOOK);
    results.off = { inter: off.inter, mono: off.mono, fontsSize: off.fontsSize };
    check("turned off, Inter is found", off.inter !== off.mono, results.off);
    await run.app.close();
  }

  console.log(JSON.stringify(results, null, 2));
  server.close();
  if (failures.length) {
    console.error("FAILED:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("fonts smoke passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
