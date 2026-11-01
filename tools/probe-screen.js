// Whether Noor's screen size (a common PC's, per profile) holds together:
// screen.width/height against the CSS media queries that also tell the
// screen (device-width, device-height, device-aspect-ratio), in a page and
// in a frame. A query that answers with this computer's real screen shows
// a site both sizes. Prints what each tells; exits 1 if they disagree.
// Needs Playwright and a display: `xvfb-run -a -s "-screen 0 1920x1080x24" node tools/probe-screen.js`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PROBE = `(() => {
  const read = (w) => {
    const s = w.screen;
    const mq = (q) => w.matchMedia(q).matches;
    const style = w.document.createElement("style");
    style.textContent = "@media (device-width: " + s.width + "px) and (device-height: " + s.height + "px) { #noor-probe { width: 7px; } }";
    w.document.head.appendChild(style);
    const box = w.document.createElement("div");
    box.id = "noor-probe";
    w.document.body.appendChild(box);
    const css = w.getComputedStyle(box).width;
    box.remove(); style.remove();
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const g = gcd(s.width, s.height);
    return {
      screen: [s.width, s.height, s.availWidth, s.availHeight],
      window: [w.outerWidth, w.outerHeight, w.innerWidth, w.innerHeight, w.screenX, w.screenY],
      deviceWidth: mq("(device-width: " + s.width + "px)"),
      deviceHeight: mq("(device-height: " + s.height + "px)"),
      aspect: mq("(device-aspect-ratio: " + (s.width / g) + "/" + (s.height / g) + ")"),
      minDeviceWidth: mq("(min-device-width: " + s.width + "px)") && !mq("(min-device-width: " + (s.width + 1) + "px)"),
      css,
      realWidth: [1366, 1440, 1536, 1600, 1680, 1920, 2560, 3440, 3840].filter((x) => mq("(device-width: " + x + "px)")),
    };
  };
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  return { page: read(window), frame: read(frame.contentWindow) };
})()`;

(async () => {
  const web = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end("<!doctype html><title>screen</title><body><p>screen</p></body>");
  });
  await new Promise((resolve) => web.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${web.address().port}/`;
  const app = await electron.launch({
    executablePath: require(path.join(root, "node_modules", "electron")),
    args: [root, "--no-sandbox"],
    env: { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), "noor-screen-")), NOOR_TEST_TIMEZONE: "Africa/Casablanca" },
  });
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  const probe = async () => {
    await main((electron, url) => { global.noorTest.browser.newTab({ url }); }, base);
    await sleep(2000);
    return main((electron, code) => global.noorTest.browser.selected.webContents.executeJavaScript(code, true), PROBE);
  };
  const result = { told: await main(() => global.noorTest.browser.fingerprint.screen()), on: await probe() };
  await main(() => global.noorTest.context.fingerprint.setEnabled("screen", false));
  result.off = await probe();
  await app.close().catch(() => {});
  web.close();
  const problems = [];
  for (const where of ["page", "frame"]) {
    const r = result.on[where];
    if (r.screen[0] !== result.told.width || r.screen[1] !== result.told.height) problems.push(`${where}: screen ${r.screen} is not the profile's ${result.told.width}x${result.told.height}`);
    for (const key of ["deviceWidth", "deviceHeight", "aspect", "minDeviceWidth"]) if (!r[key]) problems.push(`${where}: ${key} doesn't match the screen`);
    if (r.css !== "7px") problems.push(`${where}: a stylesheet's @media doesn't match the screen (${r.css})`);
    if (r.realWidth.some((w) => w !== r.screen[0])) problems.push(`${where}: device-width matches ${r.realWidth}`);
  }
  result.problems = problems;
  console.log(JSON.stringify(result, null, 2));
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
