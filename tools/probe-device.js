// What the device APIs tell a page in two profiles of a build of Noor
// ("windows", "iphone" or "android"): the battery, media devices, the
// keyboard layout and the network. A value that is this computer's own and
// changes with it (the battery's level and times) joins two profiles read
// at the same moment. Checks the battery: Noor's is a PC's plugged in and
// full, the same in every profile, with its getters as the browser's and
// its change events quiet; Noor Android's a phone's of the profile's own;
// Noor iPhone has none. Prints the rest for the record.
// Needs Playwright and a display: `xvfb-run -a node tools/probe-device.js [windows|iphone|android]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const BUILD = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PROBE = `(async () => {
  const out = { page: location.href, secure: isSecureContext };
  if (navigator.getBattery) {
    const b = await navigator.getBattery();
    const f = () => {};
    b.onlevelchange = f;
    let added = "ok";
    try { b.addEventListener("levelchange", f); } catch (e) { added = e.name; }
    const getter = Object.getOwnPropertyDescriptor(BatteryManager.prototype, "level").get;
    // A page's own event still reaches it, as in Chrome.
    let own = 0; b.addEventListener("chargingchange", () => { own++; }); b.dispatchEvent(new Event("chargingchange"));
    out.battery = { charging: b.charging, chargingTime: b.chargingTime, dischargingTime: b.dischargingTime, level: b.level,
      handlerKept: b.onlevelchange === f, added, ownEvent: own, samePromise: navigator.getBattery() === navigator.getBattery(),
      wrongThis: (() => { try { getter.call({}); return "no throw"; } catch (e) { return e.name; } })(),
      native: /\\[native code\\]/.test(Function.prototype.toString.call(getter)) && /\\[native code\\]/.test(Function.prototype.toString.call(EventTarget.prototype.addEventListener)) };
  } else out.battery = "none";
  out.devices = navigator.mediaDevices ? (await navigator.mediaDevices.enumerateDevices()).map((d) => d.kind + ":" + (d.deviceId ? d.deviceId.slice(0, 8) : "") + ":" + (d.label || "")) : "none";
  out.keyboard = navigator.keyboard && navigator.keyboard.getLayoutMap ? await navigator.keyboard.getLayoutMap().then((m) => ({ size: m.size, KeyQ: m.get("KeyQ"), KeyA: m.get("KeyA"), KeyZ: m.get("KeyZ") }), (e) => e.name) : "none";
  out.connection = navigator.connection ? { type: navigator.connection.type, effectiveType: navigator.connection.effectiveType, rtt: navigator.connection.rtt, downlink: navigator.connection.downlink, saveData: navigator.connection.saveData } : "none";
  // Still a working page: a click listener still fires.
  let clicked = false; document.body.addEventListener("click", () => { clicked = true; }); document.body.click();
  out.listenersWork = clicked;
  return out;
})()`;

(async () => {
  const web = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end("<!doctype html><title>device</title><body><p>device</p></body>");
  });
  await new Promise((resolve) => web.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${web.address().port}/`;
  const app = await electron.launch({
    executablePath: require(path.join(root, "node_modules", "electron")),
    args: [root, "--no-sandbox"],
    env: { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), "noor-device-")), NOOR_DEVICE: BUILD, NOOR_TEST_TIMEZONE: "Africa/Casablanca" },
  });
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  const probe = async () => {
    await main((electron, url) => { global.noorTest.browser.newTab({ url }); }, base);
    // The page itself, loaded (20 s at most): not the new tab's empty
    // document before it, which is no secure context, so has no battery,
    // media devices or keyboard of its own.
    for (let i = 0; i < 80; i++) {
      const state = await main((electron, url) => {
        const contents = global.noorTest.browser.selected.webContents;
        return contents.getURL() === url ? contents.executeJavaScript("document.readyState") : null;
      }, base).catch(() => null);
      if (state === "complete") break;
      await sleep(250);
    }
    await sleep(300);
    return main((electron, code) => global.noorTest.browser.selected.webContents.executeJavaScript(code, true), PROBE);
  };
  const result = { build: BUILD, first: await probe() };
  await main(() => global.noorTest.browser.createProfile("Second"));
  for (let i = 0; i < 80; i++) {
    if (await main(() => global.noorTest.browser.profile.name === "Second").catch(() => false)) break;
    await sleep(250);
  }
  result.second = await probe();
  await app.close().catch(() => {});
  web.close();
  const problems = [];
  for (const which of ["first", "second"]) {
    const r = result[which];
    if (r.page !== base) { problems.push(`${which}: read before its page loaded (${r.page})`); continue; }
    if (!r.listenersWork) problems.push(`${which}: a page's listener didn't fire`);
    const b = r.battery;
    if (BUILD === "iphone") {
      if (b !== "none") problems.push(`${which}: Safari on an iPhone has no battery: ${JSON.stringify(b)}`);
      continue;
    }
    if (typeof b !== "object") { problems.push(`${which}: no battery`); continue; }
    if (!(b.handlerKept && b.added === "ok" && b.wrongThis === "TypeError" && b.native && b.ownEvent === 1 && b.samePromise)) problems.push(`${which}: battery not as the browser's: ${JSON.stringify(b)}`);
    if (BUILD === "windows" && !(b.charging === true && b.chargingTime === 0 && b.dischargingTime === Infinity && b.level === 1)) problems.push(`${which}: not plugged in and full: ${JSON.stringify(b)}`);
  }
  result.problems = problems;
  console.log(JSON.stringify(result, null, 2));
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
