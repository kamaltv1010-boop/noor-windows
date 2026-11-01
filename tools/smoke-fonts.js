// Runs Noor and looks for fonts the way sites do: the width of text asked
// in a font (in the page, a canvas and a worker's canvas), FontFace's
// local(), the page's font list and its loading. Each profile must show
// fonts of its own (see main/fonts.js): those it picked, found (drawn with
// one of Windows' own where this computer lacks them) from the page's
// first script on, with nothing loading to see; this computer's other
// fonts not at all; a page's own web fonts as before.
// First Noor lists this computer's fonts itself; then it is given a list
// (Inter and JetBrains Mono, fonts of this test computer's that no profile
// picks, and Arial) and profiles with seeds that pick Office and that don't
// are looked at.
// Needs Playwright and a display: on Linux, `xvfb-run -a node tools/smoke-fonts.js`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");
const { pickFonts } = require("../main/fonts");

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
// A seed that picks Office (Garamond, Gill Sans MT…) and one that picks
// neither Office nor anything else this test looks for.
const seedFor = (test) => {
  for (let seed = 1; seed < 100000; seed++) if (test(pickFonts(seed))) return seed;
  throw new Error("no seed");
};
const OFFICE = seedFor((picked) => picked.groups.includes("Office"));
const PLAIN = seedFor((picked) => picked.groups.length === 0 && picked.singles.length === 0);

// The page as a site's: its first script measures at once, and watches
// the font list's loading.
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Fonts</title></head><body><p>fonts</p><script>
window.__events = [];
for (const type of ["loading", "loadingdone", "loadingerror"]) document.fonts.addEventListener(type, (event) => window.__events.push(type + ":" + event.fontfaces.length));
window.__ready = "pending";
document.fonts.ready.then(() => { if (window.__ready === "pending") window.__ready = "settled"; });
Promise.resolve().then(() => { if (window.__ready === "pending") window.__ready = "after"; });
const text = "mmmmmmmmmmlli WwQq 0123";
const span = (family) => { const e = document.createElement("span"); e.style.cssText = "position:absolute;left:-9999px;font-size:72px;white-space:nowrap;font-family:" + family; e.textContent = text; document.body.appendChild(e); const s = e.offsetWidth + "x" + e.offsetHeight; e.remove(); return s; };
window.__first = { mono: span("monospace"), garamond: span("'Garamond', monospace"), gill: span("'Gill Sans MT', monospace"), status: document.fonts.status, size: document.fonts.size };
</script></body></html>`;

// What a site measures later.
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
    const code = "const c = new OffscreenCanvas(10, 10).getContext('2d'); const m = (f) => { c.font = f; return c.measureText('" + text + "').width.toFixed(2); }; postMessage({ inter: m(\\"72px 'Inter', monospace\\"), garamond: m(\\"72px 'Garamond', monospace\\"), mono: m('72px monospace'), font: (c.font = \\"72px 'Garamond', monospace\\", c.font) });";
    const w = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
    w.onmessage = (event) => resolve(event.data);
    setTimeout(() => resolve("timeout"), 4000);
  });
  // A page's own web font (a font this computer has, as a page gives it).
  const own = new FontFace("Page Own Font", 'local("DejaVu Serif"), local("Liberation Serif"), local("Arial")');
  document.fonts.add(own);
  const ownLoaded = await own.load().then(() => "loaded", (error) => "failed " + error.name);
  return {
    first: window.__first, ready: window.__ready, events: window.__events.join(","),
    mono: span("monospace"), inter: span("'Inter', monospace"), interLight: span("'Inter Light', monospace"), jetbrains: span("'JetBrains Mono', monospace"),
    garamond: span("'Garamond', monospace"), garamondSerif: span("'Garamond', serif"),
    canvasMono: measure("72px monospace"), canvasInter: measure("72px 'Inter', monospace"), canvasGaramond: measure("72px 'Garamond', monospace"),
    localInterBold: await local("Inter Bold"), localPostScript: await local("Inter-Bold"), localGaramond: await local("Garamond"), localGaramondBold: await local("Garamond Bold"),
    worker,
    fonts: [...document.fonts].map((face) => face.family).join(","),
    forEach: (() => { const seen = []; document.fonts.forEach((face) => seen.push(face.family)); return seen.join(","); })(),
    hasOwn: document.fonts.has(own),
    check: document.fonts.check('12px "Inter"'),
    ownLoaded, ownSpan: span("'Page Own Font', monospace"),
    constructorLooks: Function.prototype.toString.call(FontFace) + " " + FontFace.name + " " + FontFace.length + " " + (FontFace.prototype.constructor === FontFace) + " " + (own instanceof FontFace),
    statusLooks: Function.prototype.toString.call(Object.getOwnPropertyDescriptor(FontFaceSet.prototype, "status").get) + " " + Function.prototype.toString.call(Object.getOwnPropertyDescriptor(FontFaceSet.prototype, "ready").get),
    notNew: (() => { try { FontFace("x", "local(x)"); return "no throw"; } catch (error) { return error.message; } })(),
  };
})()`;

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(PAGE);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const failures = [];
  const check = (name, ok, detail) => {
    if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`);
  };
  const results = { seeds: { office: OFFICE, plain: PLAIN } };

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
    let listed = null;
    for (let i = 0; i < 50 && !listed; i++) {
      listed = await run.main(() => (global.noorTest.context.fonts.known ? global.noorTest.context.fonts.faces.map((face) => face[0]) : null));
      if (!listed) await sleep(200);
    }
    const kept = fs.existsSync(path.join(run.userData, "fonts.json")) ? JSON.parse(fs.readFileSync(path.join(run.userData, "fonts.json"), "utf8")).faces.length : 0;
    results.listed = { families: listed ? [...new Set(listed)].length : 0, kept };
    check("this computer's fonts are listed", Array.isArray(listed) && listed.includes("Inter") && listed.includes("JetBrains Mono"), results.listed);
    check("the list is kept for the next run", kept > 10, kept);
    await run.app.close();
  }

  // Profiles, with Inter and JetBrains Mono on this computer.
  {
    const run = await launch({ NOOR_TEST_FONTS: JSON.stringify(FACES) });
    const inTab = (code) => run.main((electron, source) => global.noorTest.browser.selected.webContents.executeJavaScript(source, true), code);
    const lookWith = async (seed, label) => {
      await run.main((electron, value) => {
        const fingerprint = global.noorTest.browser.fingerprint;
        global.noorTest.context.store.set(fingerprint.seedKey("fonts"), value);
      }, seed);
      await run.main((electron, url) => { global.noorTest.browser.newTab({ url }); }, base + label);
      await sleep(2000);
      return inTab(LOOK);
    };

    const office = await lookWith(OFFICE, "office");
    const plain = await lookWith(PLAIN, "plain");
    results.office = office;
    results.plain = { garamond: plain.garamond, mono: plain.mono, localGaramond: plain.localGaramond, first: plain.first };

    // A profile with Office finds Garamond from its first script on, drawn
    // at a size of its own; one without, doesn't.
    check("Office's Garamond is found from the first script", office.first.garamond !== office.first.mono && office.first.gill !== office.first.mono && office.first.garamond !== office.first.gill, office.first);
    check("and later, in a canvas too", office.garamond !== office.mono && office.canvasGaramond !== office.canvasMono, office);
    check("and by local()", office.localGaramond === "found" && office.localGaramondBold === "found", office);
    check("and in a worker's canvas, reading back as the browser writes it", office.worker && office.worker.garamond !== office.worker.mono && office.worker.font === "72px Garamond, monospace", office.worker);
    check("the profile without Office doesn't find Garamond", plain.garamond === plain.mono && /^missing/.test(plain.localGaramond), results.plain);
    // Nothing loading to see.
    check("the font list reads as loaded at the first script", office.first.status === "loaded" && office.first.size === 0, office.first);
    check("ready is settled at the first script", office.ready === "settled", office.ready);
    check("no loading event for the profile's fonts", office.events === "" || office.events === "loading:0,loadingdone:1", office.events);
    // This computer's other fonts, hidden in both.
    for (const [name, look] of [["office", office], ["plain", plain]]) {
      check(`${name}: Inter isn't found`, look.inter === look.mono && look.interLight === look.mono && look.jetbrains === look.mono, look);
      check(`${name}: nor in a canvas`, look.canvasInter === look.canvasMono, look);
      check(`${name}: nor in a worker's canvas`, look.worker && look.worker.inter === look.worker.mono, look.worker);
      check(`${name}: nor by local()`, /^missing/.test(look.localInterBold) && /^missing/.test(look.localPostScript), look);
      check(`${name}: the font list has the page's own font only`, look.fonts === '"Page Own Font"' && look.forEach === '"Page Own Font"' && look.hasOwn, look);
      check(`${name}: check() as for any font`, look.check === true, look.check);
      check(`${name}: a page's own font still works`, look.ownLoaded === "loaded" && look.ownSpan !== look.mono, look);
    }
    check("FontFace looks as the browser's", office.constructorLooks === "function FontFace() { [native code] } FontFace 2 true true", office.constructorLooks);
    check("the font list's getters look as the browser's", office.statusLooks === "function get status() { [native code] } function get ready() { [native code] }", office.statusLooks);
    check("FontFace without new is refused as by the browser", office.notNew === "Failed to construct 'FontFace': Please use the 'new' operator, this DOM object constructor cannot be called as a function.", office.notNew);

    // New fonts for the profile: another list.
    const before = await run.main(() => global.noorTest.browser.fingerprint.visibleValue(global.noorTest.browser.fingerprint.seed("fonts"), "fonts"));
    const after = await run.main(() => { const f = global.noorTest.browser.fingerprint; f.newSeeds(["fonts"]); return f.visibleValue(f.seed("fonts"), "fonts"); });
    results.renewed = { before, after };
    check("New gives the profile other fonts", before !== after, results.renewed);

    // Turned off: this computer's own fonts (Inter found again).
    await run.main(() => global.noorTest.browser.fingerprint.setEnabled("fonts", false));
    await run.main((electron, url) => { global.noorTest.browser.newTab({ url }); }, base + "fonts-off");
    await sleep(2000);
    const off = await inTab(LOOK);
    results.off = { inter: off.inter, mono: off.mono, garamond: off.garamond };
    check("turned off, Inter is found and Garamond isn't", off.inter !== off.mono && off.garamond === off.mono, results.off);
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
