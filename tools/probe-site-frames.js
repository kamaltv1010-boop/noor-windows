// Whether the protection holds in frames of the site's own. Such a frame
// starts empty (about:blank), and the page around it protects that window;
// when the frame then loads its page, Chromium keeps the window (and all
// that was put in it) and gives the page only a document of its own,
// running no preload there. Before Noor made what it makes for a document
// again for the new one, such a frame showed a site this computer's own
// fonts (the protection's faces were in the empty document's font list),
// and a canvas drawn on there never answered toBlob.
// A site served here has: a frame of its own by address, one by srcdoc, one
// it adds and reaches at once, one inside one of those, and one of another
// site's (as before: a window of its own). Each, and the page, looks for
// fonts the way sites do, first thing (text written in the page, read with
// offsetWidth before anything else), with elements it adds, and with a
// canvas's measureText; and saves a canvas drawn on with toBlob.
// The fonts are this computer's (Inter and JetBrains Mono, installed for
// the checks on Windows and Linux alike, and Linux's own) and Windows' own:
// Noor (the Windows build) with every protection off finds which are here;
// in the build checked, with its protection, those its page doesn't show
// (this computer's, or Windows' own an iPhone or Android lacks) must show
// in no frame either.
// Also, the page itself must hide Inter and JetBrains Mono (this
// computer's, picked by no profile, on no iPhone or Android).
// Prints what each frame found; exits 1 if a frame shows a font the page
// hides, the page shows Inter or JetBrains Mono, or toBlob gives nothing
// back. Needs Playwright and a display:
// `xvfb-run -a node tools/probe-site-frames.js [windows|iphone|android]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const BUILD = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const FONTS = ["Inter", "JetBrains Mono", "DejaVu Sans", "DejaVu Serif", "FreeSerif", "FreeSans", "Caladea", "Carlito", "IPAGothic", "Liberation Sans", "Noto Sans", "Ubuntu",
  "Segoe UI", "Calibri", "Consolas", "Tahoma", "Cambria", "Arial", "Times New Roman", "Courier New", "Verdana", "Georgia"];
const BASES = ["monospace", "serif", "sans-serif"];
const TEXT = "mmmmmmmmmmlli1WwQq@";
const STYLE = "position:absolute;left:-9999px;top:0;font-size:48px;white-space:nowrap";

// Text written in the page: one span per font and base, and the bases
// alone; read first thing, before any other call.
const WRITTEN = BASES.map((base, b) => `<span id="base${b}" style="${STYLE};font-family:${base}">${TEXT}</span>`).join("")
  + FONTS.map((font, f) => BASES.map((base, b) => `<span id="f${f}b${b}" style="${STYLE};font-family:'${font}',${base}">${TEXT}</span>`).join("")).join("");
const LOOK = `
const FONTS = ${JSON.stringify(FONTS)};
const BASES = ${JSON.stringify(BASES)};
const TEXT = ${JSON.stringify(TEXT)};
const found = (width) => FONTS.filter((font, f) => BASES.some((base, b) => width(f, b) !== width(-1, b))).join(", ");
`;
const KID = (name) => `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title></head><body>${WRITTEN}
<script>
${LOOK}
window.__written = found((f, b) => document.getElementById(f < 0 ? "base" + b : "f" + f + "b" + b).offsetWidth);
</script>
<script>
(async () => {
  const out = { name: ${JSON.stringify(name)}, written: window.__written };
  try {
    const added = (family) => { const e = document.createElement("span"); e.style.cssText = ${JSON.stringify(STYLE)} + ";font-family:" + family; e.textContent = TEXT; document.body.appendChild(e); const w = e.offsetWidth; e.remove(); return w; };
    out.added = found((f, b) => added(f < 0 ? BASES[b] : "'" + FONTS[f] + "'," + BASES[b]));
  } catch (e) { out.added = "ERR " + e.message; }
  try {
    const c = document.createElement("canvas").getContext("2d");
    out.canvas = found((f, b) => { c.font = "48px " + (f < 0 ? BASES[b] : "'" + FONTS[f] + "'," + BASES[b]); return c.measureText(TEXT).width; });
  } catch (e) { out.canvas = "ERR " + e.message; }
  out.toBlob = await new Promise((resolve) => {
    try {
      const c = Object.assign(document.createElement("canvas"), { width: 60, height: 20 });
      const x = c.getContext("2d");
      x.fillStyle = "#c00"; x.fillRect(0, 0, 60, 20); x.fillStyle = "#fff"; x.font = "12px sans-serif"; x.fillText("Noor", 2, 14);
      c.toBlob((blob) => resolve(blob ? "a blob of " + blob.size + " bytes" : "null"));
      setTimeout(() => resolve("NO ANSWER in 4 s"), 4000);
    } catch (e) { resolve("ERR " + e.message); }
  });
  await fetch("/report", { method: "POST", body: JSON.stringify(out) });
})();
</script></body></html>`;

(async () => {
  const reports = {};
  let port;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => { try { const r = JSON.parse(body); reports[r.name] = r; } catch (e) {} res.end("ok"); });
      return;
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    if (url.pathname === "/kid") return res.end(KID(url.searchParams.get("name")));
    if (url.pathname === "/outer") return res.end(`<!doctype html><body><p>outer</p><iframe src="/kid?name=a frame in a frame of the site's"></iframe></body>`);
    // The page: itself first, then its frames.
    const srcdoc = KID("a frame by srcdoc").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    res.end(KID("the page").replace("</body></html>", `
<iframe src="/kid?name=a frame of the site's"></iframe>
<iframe srcdoc="${srcdoc}"></iframe>
<iframe src="/outer"></iframe>
<iframe src="http://other.test:${port}/kid?name=another site's frame"></iframe>
<script>
const f = document.createElement("iframe");
f.src = "/kid?name=a frame added and reached at once";
document.body.appendChild(f);
f.contentWindow.__reached = true;
</script></body></html>`));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
  const electronPath = process.env.NOOR_ELECTRON ? path.resolve(process.env.NOOR_ELECTRON) : require(path.join(root, "node_modules", "electron"));
  const appArgs = fs.existsSync(path.join(path.dirname(electronPath), "resources", "app.asar")) ? [] : [root];

  const visit = async (settings, build) => {
    for (const key of Object.keys(reports)) delete reports[key];
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-siteframes-"));
    if (settings) fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify(settings));
    const env = { ...process.env, NOOR_TEST: "1", NOOR_TEST_TIMEZONE: "Africa/Casablanca", NOOR_USER_DATA: userData, NOOR_DEVICE: build };
    const app = await electron.launch({ executablePath: electronPath, args: appArgs.concat(["--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1"]), env });
    for (let i = 0; i < 200; i++) {
      if (await app.evaluate(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
      await sleep(100);
    }
    await sleep(1000);
    // The profile's fonts seed, as the app reads it (see FONTS_SEED).
    const seed = await app.evaluate(() => global.noorTest.browser.fingerprint.seed("fonts")).catch(() => null);
    await app.evaluate((electron, url) => { global.noorTest.browser.newTab({ url }); }, `http://site.test:${port}/`);
    for (let i = 0; i < 150 && Object.keys(reports).length < 6; i++) await sleep(100);
    await sleep(300);
    await app.close().catch(() => {});
    return Object.assign(JSON.parse(JSON.stringify(reports)), { fontsSeed: seed });
  };
  const off = {};
  for (const kind of ["canvas", "webGL", "gpu", "audio", "clientRects", "screen", "hardware", "fonts"]) off[`protection.${kind}`] = false;
  // What this computer has: the plain Windows build, nothing protected.
  const plain = await visit(off, "windows");
  // A Windows profile shows a few fonts of its own, picked from its seed
  // among those PCs have (rules/font-pool.json): Inter and JetBrains Mono
  // among them (each in about 1 profile in 18). Seed 1 picks neither, so
  // both, installed here for the checks, must be hidden by the page.
  const FONTS_SEED = 1;
  const protectedRun = await visit({ "seed.fonts": FONTS_SEED }, BUILD);
  server.close();

  const list = (text) => (typeof text === "string" && !/^ERR/.test(text) ? text.split(", ").filter(Boolean) : []);
  const here = new Set(list(plain["the page"] && plain["the page"].written));
  const page = protectedRun["the page"] || {};
  const shown = new Set(list(page.written).concat(list(page.added), list(page.canvas)));
  const hidden = [...here].filter((font) => !shown.has(font));
  for (const [name, r] of Object.entries(plain)) if (r && typeof r === "object") console.log(`(every protection off) ${name}: written [${r.written}] added [${r.added}] canvas [${r.canvas}] toBlob ${r.toBlob}`);
  console.log(`FONTS HERE (every protection off, the page): ${[...here].join(", ") || "none"}`);
  console.log(`FONTS THE PAGE HIDES (${BUILD}, protected): ${hidden.join(", ") || "none"}`);

  const problems = [];
  if (!hidden.length) problems.push("no font of this computer's is hidden by the page, so the frames prove nothing (are Inter and JetBrains Mono installed?)");
  // Fonts of this computer's no profile picks and no iPhone or Android has
  // (installed for the checks): the page itself hides them, in every build
  // (Noor iPhone and Noor Android once showed every font of this computer's
  // their own lists didn't name, the same in every profile).
  const NOBODY_HAS = ["Inter", "JetBrains Mono"];
  for (const font of NOBODY_HAS) {
    if (here.has(font) && shown.has(font)) problems.push(`the page shows ${font}, a font of this computer's no ${BUILD} profile has`);
  }
  if (!NOBODY_HAS.some((font) => here.has(font))) console.log("NOTE: neither Inter nor JetBrains Mono is installed here: the page's own hiding of this computer's fonts is not checked");
  if (protectedRun.fontsSeed !== FONTS_SEED) problems.push(`the profile's fonts seed is ${protectedRun.fontsSeed}, not ${FONTS_SEED}: the check's settings didn't take`);
  const NAMES = ["the page", "a frame of the site's", "a frame by srcdoc", "a frame added and reached at once", "a frame in a frame of the site's", "another site's frame"];
  for (const name of NAMES) {
    const r = protectedRun[name];
    if (!r) {
      problems.push(`${name}: no report`);
      console.log(`FRAME ${name}: NO REPORT`);
      continue;
    }
    const leaked = {};
    for (const way of ["written", "added", "canvas"]) {
      const seen = list(r[way]);
      const bad = seen.filter((font) => hidden.includes(font));
      if (bad.length) leaked[way] = bad;
      if (typeof r[way] === "string" && /^ERR/.test(r[way])) problems.push(`${name}: ${way} ${r[way]}`);
    }
    if (Object.keys(leaked).length) problems.push(`${name} shows fonts the page hides: ${JSON.stringify(leaked)}`);
    if (!/^a blob of/.test(r.toBlob)) problems.push(`${name}: toBlob ${r.toBlob}`);
    console.log(`FRAME ${name}: written [${r.written}] added [${r.added}] canvas [${r.canvas}] toBlob ${r.toBlob}${Object.keys(leaked).length ? " — SHOWS HIDDEN FONTS " + JSON.stringify(leaked) : ""}`);
  }
  console.log(problems.length ? `SITE FRAMES: ${problems.length} PROBLEM(S): ${problems.join(" | ")}` : "SITE FRAMES: every frame of the site's hides what the page hides, and toBlob answers");
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
