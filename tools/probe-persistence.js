// Whether a profile stays itself, in a build of Noor ("windows", "iphone"
// or "android"): what a page reads in two profiles (canvas and WebGL
// hashes, the WebGL renderer, the screen, cores and memory, the user
// agent, the time zone, the battery, fonts) is read again after the app
// restarts (it must be the same, profile by profile, and differ between the
// two); then each protection is turned off and on again, through the
// settings as a user does, across a restart, and each must change what the
// page reads when off and give back the profile's own when on again.
// Prints what changed; exits 1 on any mismatch.
// Needs Playwright and a display: `xvfb-run -a node tools/probe-persistence.js [windows|iphone|android]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const BUILD = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const READ = `(async () => {
  const fnv = (b) => { let h = 0x811c9dc5; for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h; };
  const c = document.createElement("canvas"); c.width = 160; c.height = 40;
  const x = c.getContext("2d"); x.font = "16px Arial"; x.fillStyle = "#246"; x.fillText("Noor \\u{1F600} persist", 2, 24);
  const canvas = fnv(x.getImageData(0, 0, 160, 40).data);
  const g = document.createElement("canvas").getContext("webgl");
  const ext = g && g.getExtension("WEBGL_debug_renderer_info");
  const renderer = ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
  // Twelve texts: the noise moves each width one step up or down, so one
  // width alone is the same in two profiles half the time; twelve, rarely.
  const textWidth = ["Noor persist Wy", "Quick fox", "0123456789", "MMMMMM", "illll", "Salam \u0645\u0631\u062d\u0628\u0627", "AVATAR", "jumps over", "WWWW", "lazy dog", "Ag", "\u{1F600}\u{1F44D}"].map((t) => {
    const span = document.createElement("span"); span.style.font = "16px Arial"; span.textContent = t;
    document.body.appendChild(span); const w = span.getBoundingClientRect().width; span.remove(); return w;
  }).join(",");
  const width = (f) => { const s = document.createElement("span"); s.style.font = "40px " + f; s.textContent = "mmmmmmmmmmlli"; document.body.appendChild(s); const w = s.offsetWidth; s.remove(); return w; };
  const base = width("monospace");
  const fonts = ["DejaVu Sans", "Liberation Mono", "Calibri", "Segoe UI", "Roboto", "Noto Naskh Arabic", "Noto Sans Thai", "Helvetica Neue"].filter((f) => width("'" + f + "', monospace") !== base).join(",");
  const battery = navigator.getBattery ? await navigator.getBattery().then((b) => b.level + "/" + b.charging) : "none";
  return { canvas, renderer, textWidth, fonts, battery, screen: screen.width + "x" + screen.height, cores: navigator.hardwareConcurrency, memory: navigator.deviceMemory,
    hw: navigator.hardwareConcurrency + "/" + navigator.deviceMemory, ua: navigator.userAgent, zone: Intl.DateTimeFormat().resolvedOptions().timeZone };
})()`;

(async () => {
  const web = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end("<!doctype html><title>persist</title><body><p>persist</p></body>");
  });
  await new Promise((resolve) => web.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${web.address().port}/`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-persist-"));
  let app = null;
  const launch = async () => {
    app = await electron.launch({
      executablePath: require(path.join(root, "node_modules", "electron")),
      args: [root, "--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
      env: { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: userData, NOOR_DEVICE: BUILD, NOOR_TEST_TIMEZONE: "Africa/Casablanca" },
    });
    for (let i = 0; i < 200; i++) {
      if (await app.evaluate(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
      await sleep(100);
    }
    await sleep(1000);
  };
  const main = (fn, arg) => app.evaluate(fn, arg);
  /// What a page of the profile named `name` reads (its window is brought
  /// up, or opened, first).
  const readIn = async (name) => {
    await main(async (electron, wanted) => {
      const profile = global.noorTest.context.profiles.all().find((p) => p.name === wanted);
      await global.noorTest.windows.open(profile);
    }, name);
    await sleep(1200);
    await main((electron, url) => { global.noorTest.browser.newTab({ url }); }, base);
    await sleep(2000);
    return main((electron, code) => global.noorTest.browser.selected.webContents.executeJavaScript(code, true), READ);
  };
  const setSwitch = (kind, on) => main((electron, [k, v]) => { global.noorTest.context.fingerprint.setEnabled(k, v); }, [kind, on]);

  const problems = [];
  const result = { build: BUILD };
  await launch();
  await main(() => global.noorTest.browser.createProfile("Second"));
  await sleep(1500);
  const names = await main(() => global.noorTest.context.profiles.all().map((p) => p.name));
  const kinds = await main(() => global.noorTest.context.fingerprint.kinds.filter((k) => k !== "device"));
  result.kinds = kinds;
  // Every protection on.
  for (const kind of kinds) await setSwitch(kind, true);
  result.before = {};
  for (const name of names) result.before[name] = await readIn(name);
  await app.close();
  await launch();
  result.afterRestart = {};
  for (const name of names) result.afterRestart[name] = await readIn(name);
  for (const name of names) {
    const a = result.before[name], b = result.afterRestart[name];
    for (const key of Object.keys(a)) if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) problems.push(`${name}: ${key} changed across a restart: ${a[key]} → ${b[key]}`);
  }
  const [first, second] = names;
  for (const key of ["canvas", "textWidth"]) {
    if (result.before[first][key] === result.before[second][key]) problems.push(`${key} is the same in two profiles: ${result.before[first][key]}`);
  }
  // Each protection off, across a restart, then on again.
  const SHOWS = { canvas: "canvas", webGL: null, gpu: "renderer", audio: null, clientRects: "textWidth", screen: "screen", hardware: "hw", fonts: "fonts" };
  result.switches = {};
  for (const kind of kinds) {
    const key = SHOWS[kind];
    if (!key) continue;
    await setSwitch(kind, false);
    await app.close();
    await launch();
    const off = await readIn(first);
    await setSwitch(kind, true);
    const on = await readIn(first);
    result.switches[kind] = { on: on[key], off: off[key] };
    // (A profile may have picked what this computer has, a screen of its
    // size for one: then off and on look alike, and nothing is shown.)
    if (JSON.stringify(off[key]) === JSON.stringify(result.before[first][key])) result.switches[kind].same = "the profile's value is this computer's own: not shown either way";
    if (JSON.stringify(on[key]) !== JSON.stringify(result.before[first][key])) problems.push(`${kind} on again doesn't give back the profile's ${key}: ${on[key]} vs ${result.before[first][key]}`);
  }
  await app.close().catch(() => {});
  web.close();
  result.problems = problems;
  console.log(JSON.stringify(result, null, 2));
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
