// Launches the app in Electron and checks the basics from outside: what a
// page sees, tracker blocking, profiles, the app's pages, a new session.
// Needs Playwright (npm install -g playwright, or a project that has it)
// and a display: on Linux, `xvfb-run -a node tools/smoke-electron.js`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Smoke</title></head><body><p>hello</p>
<img id="t" src="https://www.google-analytics.com/analytics.js?x=1"><script>document.cookie = "smoke=1; path=/";</script></body></html>`;
/// A page that sets no cookie, to see what a profile already has.
const QUIET = PAGE.replace(/<script>.*<\/script>/, "");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  let lastHeaders = {};
  const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const SW_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>SW</title></head><body><img id="i" src="/pixel.png?1">
<script>navigator.serviceWorker.register("/sw.js").then((r) => r.update()).catch((e) => { document.title = "SW failed " + e; });</script></body></html>`;
  const CANONICAL_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Canon</title><link rel="canonical" href="/canonical-clean"></head><body>canon</body></html>`;
const SW = `self.addEventListener("install", () => self.skipWaiting()); self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => { event.respondWith(fetch(event.request)); });
self.addEventListener("message", (event) => { event.ports[0].postMessage({ zone: Intl.DateTimeFormat().resolvedOptions().timeZone, cores: navigator.hardwareConcurrency, memory: navigator.deviceMemory, brands: navigator.userAgentData ? navigator.userAgentData.brands.map((b) => b.brand).join(",") : "-", toStr: Function.prototype.toString.call(Object.getOwnPropertyDescriptor(WorkerNavigator.prototype, "hardwareConcurrency").get), stack: (() => { try { Object.getOwnPropertyDescriptor(WorkerNavigator.prototype, "hardwareConcurrency").get.call({}); return "no throw"; } catch (e) { return e.message + " | foreign=" + /protect|preload|anonymous/.test(String(e.stack).split("\\n").slice(1).join("\\n")); } })() }); });`;
  const server = http.createServer((req, res) => {
    lastHeaders = req.headers;
    if (req.url.startsWith("/pixel.png")) {
      res.setHeader("content-type", "image/png");
      res.setHeader("cache-control", "no-store");
      return res.end(PIXEL);
    }
    if (req.url === "/sw.js") {
      res.setHeader("content-type", "text/javascript");
      res.setHeader("cache-control", "no-store");
      return res.end(SW);
    }
    res.setHeader("content-type", "text/html");
    res.setHeader("cache-control", "no-store");
    res.end(req.url.startsWith("/canonical") ? CANONICAL_PAGE : req.url.startsWith("/sw") ? SW_PAGE : req.url.startsWith("/quiet") ? QUIET : PAGE);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-smoke-"));
  const app = await electron.launch({
    executablePath: require(path.join(root, "node_modules", "electron")),
    args: [root, "--no-sandbox"],
    env: {
      ...process.env,
      NOOR_TEST: "1",
      NOOR_USER_DATA: userData,
      // The test server counts as a tracker everywhere but on its own pages,
      // like Meta's domains: a request of its service worker must still pass.
      NOOR_TEST_RULES: JSON.stringify([{ domain: "127.0.0.1", allowedOn: ["127.0.0.1"] }]),
      NOOR_TEST_TIMEZONE: "America/New_York",
    },
  });
  app.process().stderr.on("data", (data) => process.stderr.write("[electron] " + data));
  app.process().stdout.on("data", (data) => process.stdout.write("[electron] " + data));
  const main = (fn, arg) => app.evaluate(fn, arg);
  const results = {};

  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected))) break;
    await sleep(100);
  }
  const waitLoaded = async () => {
    for (let i = 0; i < 100; i++) {
      const loading = await main(() => {
        const tab = global.noorTest.browser.selected;
        return !tab || tab.webContents.isLoading() || tab.loading;
      });
      if (!loading) break;
      await sleep(100);
    }
    await sleep(300);
  };
  const open = async (url) => {
    await main((electron, target) => { global.noorTest.browser.newTab({ url: target }); }, url);
    await waitLoaded();
  };
  const inTab = (code) => main((electron, source) => global.noorTest.browser.selected.webContents.executeJavaScript(source, true), code);

  await open(base);
  results.page = await inTab(`(async () => ({
    ua: navigator.userAgent,
    brands: navigator.userAgentData ? navigator.userAgentData.brands.map((b) => b.brand + " " + b.version).join(", ") : "missing",
    fullVersions: navigator.userAgentData ? await navigator.userAgentData.getHighEntropyValues(["fullVersionList", "uaFullVersion"]).then((v) => v.fullVersionList.map((b) => b.brand + " " + b.version).join(", ") + " | " + v.uaFullVersion) : "-",
    screen: screen.width + "x" + screen.height + " avail " + screen.availWidth + "x" + screen.availHeight,
    cores: navigator.hardwareConcurrency, memory: navigator.deviceMemory,
    noor: typeof window.noor, process: typeof process, require: typeof require, Buffer: typeof Buffer,
    chrome: typeof chrome !== "undefined" ? Object.keys(chrome).join(",") || "(no keys)" : "missing",
    plugins: navigator.plugins.length, pdf: navigator.pdfViewerEnabled, webdriver: navigator.webdriver, platform: navigator.platform,
    chromeKeys: typeof chrome !== "undefined" ? Object.keys(chrome).join(",") : "-",
    csi: typeof chrome !== "undefined" && chrome.csi ? Object.keys(chrome.csi()).join(",") + " " + Function.prototype.toString.call(chrome.csi) : "-",
    cookie: document.cookie, title: document.title,
    toStr: Function.prototype.toString.call(HTMLCanvasElement.prototype.toDataURL),
    wrongThis: (() => { try { HTMLCanvasElement.prototype.toDataURL.call({}); return "no throw"; } catch (e) { return e.message; } })(),
    stackThroughWrapper: (() => { try { HTMLCanvasElement.prototype.toDataURL.call({}); } catch (e) { return String(e.stack).split("\\n").length + " frames, preload=" + /preload/.test(e.stack); } })(),
    stackPlain: (() => { try { null.x; } catch (e) { return String(e.stack).split("\\n").length + " frames"; } })(),
    getterWrongThis: (() => { try { Object.getOwnPropertyDescriptor(Screen.prototype, "width").get.call({}); return "no throw"; } catch (e) { return e.message; } })(),
    trackerLoaded: document.getElementById("t").naturalWidth > 0,
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone + " " + new Date(2026, 0, 15).getTimezoneOffset() + " " + new Date(2026, 6, 15).getTimezoneOffset(),
    frameZone: (() => { const f = document.createElement("iframe"); document.body.appendChild(f); const z = f.contentWindow.Intl.DateTimeFormat().resolvedOptions().timeZone; f.remove(); return z; })(),
    worker: await new Promise((resolve) => {
      const code = "postMessage({ zone: Intl.DateTimeFormat().resolvedOptions().timeZone, cores: navigator.hardwareConcurrency, memory: navigator.deviceMemory, brands: navigator.userAgentData ? navigator.userAgentData.brands.map((b) => b.brand).join(',') : '-', toStr: Function.prototype.toString.call(Object.getOwnPropertyDescriptor(WorkerNavigator.prototype, 'hardwareConcurrency').get), illegal: (() => { try { Object.getOwnPropertyDescriptor(WorkerNavigator.prototype, 'hardwareConcurrency').get.call({}); return 'no throw'; } catch (e) { return e.message; } })() })";
      const worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
      const timer = setTimeout(() => resolve("timeout"), 5000);
      worker.onmessage = (event) => { clearTimeout(timer); resolve(event.data); };
      worker.onerror = (event) => { clearTimeout(timer); resolve("error " + event.message); };
    }),
  }))()`);
  results.headers = { ua: lastHeaders["user-agent"], secChUa: lastHeaders["sec-ch-ua"], platform: lastHeaders["sec-ch-ua-platform"] };
  results.tab = await main(() => {
    const tab = global.noorTest.browser.selected;
    return { url: tab.url, trackersBlocked: tab.trackersBlocked, title: tab.title, tabs: global.noorTest.browser.tabs.length };
  });

  // Profiles keep their cookies apart.
  await main(() => global.noorTest.browser.createProfile("Test"));
  await sleep(500);
  await open(base + "quiet-second");
  results.otherProfile = {
    cookie: await inTab("document.cookie"),
    ...(await main(() => ({ profile: global.noorTest.browser.profile.name, profiles: global.noorTest.context.profiles.all().length, tabs: global.noorTest.browser.tabs.length }))),
  };
  await main(() => global.noorTest.browser.switchProfile("default"));
  await sleep(500);
  await open(base + "quiet-third");
  results.backInDefault = { cookie: await inTab("document.cookie"), profile: await main(() => global.noorTest.browser.profile.name) };

  // The app's own pages reach the main process.
  await open("noor://app/settings.html");
  results.settingsPage = await inTab(`noor.invoke("settings:get").then((s) => ({ version: s.version, profiles: s.profiles.map((p) => p.name).join(","), screen: s.values.screen.width + "x" + s.values.screen.height, rows: document.querySelectorAll(".row").length }))`);
  await open("noor://app/start.html");
  results.startPage = await inTab(`new Promise((r) => setTimeout(() => r({ title: document.getElementById("title").textContent, profile: document.getElementById("profilename").textContent, trackers: document.getElementById("trackers").textContent }), 500))`);

  // A page served through its service worker: its own files aren't blocked
  // although the worker's requests come from no tab.
  await open(base + "sw");
  await sleep(1500);
  await main(() => global.noorTest.browser.selected.reload());
  await waitLoaded();
  await sleep(500);
  results.serviceWorker = {
    ...(await inTab(`(async () => ({ title: document.title, controlled: Boolean(navigator.serviceWorker.controller), imageLoaded: document.getElementById("i").naturalWidth > 0,
      pageCores: navigator.hardwareConcurrency,
      pageZone: Intl.DateTimeFormat().resolvedOptions().timeZone + " " + new Date(2026, 0, 15).getTimezoneOffset(),
      worker: await new Promise((resolve) => {
        const timer = setTimeout(() => resolve("timeout"), 5000);
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => { clearTimeout(timer); resolve(event.data); };
        navigator.serviceWorker.controller.postMessage("values", [channel.port2]);
      }) }))()`)),
    trackersBlocked: await main(() => global.noorTest.browser.selected.trackersBlocked),
  };

  // A bookmark keeps the page's canonical address, not the moment's.
  await open(base + "canonical?reg_splash=1&fbclid=abc");
  await sleep(500);
  results.bookmark = await main(() => {
    const browser = global.noorTest.browser;
    const saved = browser.toggleBookmark();
    const list = global.noorTest.context.bookmarks.all().map((b) => b.url);
    const state = browser.state();
    browser.toggleBookmark();
    return { saved, list, starOn: state.bookmarked, left: global.noorTest.context.bookmarks.all().length };
  });

  // A favorite opened from the start page lands in the same tab.
  await main((electron, url) => { global.noorTest.context.bookmarks.add("Quiet", url); }, base + "quiet-fav");
  await open("noor://app/start.html");
  await sleep(500);
  await inTab(`noor.invoke("nav:go", ${JSON.stringify(base + "quiet-fav")})`);
  await sleep(1500);
  await waitLoaded();
  results.favorite = await main(() => ({ url: global.noorTest.browser.selected.url, title: global.noorTest.browser.selected.title, tabs: global.noorTest.browser.tabs.length }));

  // A new session: new seeds, one tab.
  const before = await main(() => global.noorTest.context.fingerprint.signature());
  await main(() => global.noorTest.browser.startNewSession());
  await sleep(800);
  results.newSession = await main((electron, previous) => ({
    seedsChanged: global.noorTest.context.fingerprint.signature() !== previous,
    tabs: global.noorTest.browser.tabs.length,
    url: global.noorTest.browser.selected.url,
  }), before);

  // Deleting the other profile.
  await main(async () => {
    const profile = global.noorTest.context.profiles.all().find((p) => p.name === "Test");
    await global.noorTest.browser.deleteProfile(profile.id);
  });
  results.afterDelete = await main(() => global.noorTest.context.profiles.all().map((p) => p.name).join(","));

  // A window a site opens with features (a sign-in popup): the page gets it
  // back, it is a tab of its own with the protection, and Noor throws nothing.
  await main(() => {
    global.__mainErrors = [];
    process.on("uncaughtException", (error) => global.__mainErrors.push(String((error && error.message) || error)));
  });
  await open(base);
  const popupOpened = await inTab(`Boolean(window.open(${JSON.stringify(base + "popup")}, "signin", "width=480,height=600"))`);
  await sleep(2000);
  results.popup = await main(async (electron, [target]) => {
    // The same drawing reads the same in the popup as in its opener (the
    // same site, so the same noise): the popup has the protection too.
    const canvas = "(() => { const c = new OffscreenCanvas(80, 24); const x = c.getContext('2d'); x.font = '15px sans-serif'; x.fillText('Noor 42', 2, 17); let h = 0; for (const v of x.getImageData(0, 0, 80, 24).data) h = (h * 31 + v) >>> 0; return h; })()";
    const tabs = global.noorTest.browser.tabs.filter((t) => !t.webContents.isDestroyed());
    const tab = tabs.find((t) => t.webContents.getURL() === target);
    const from = tab && tab.opener && !tab.opener.webContents.isDestroyed() ? tab.opener : null;
    const page = tab ? await tab.webContents.executeJavaScript(`({ opener: Boolean(window.opener), canvas: ${canvas} })`, true) : null;
    if (page && from) {
      page.protected = page.canvas === await from.webContents.executeJavaScript(canvas, true);
    }
    return { tab: Boolean(tab), page, errors: global.__mainErrors };
  }, [base + "popup", base]);
  results.popup.opened = popupOpened;
  if (!(popupOpened && results.popup.tab && results.popup.page && results.popup.page.opener && results.popup.page.protected && results.popup.errors.length === 0)) {
    console.error("POPUP FAILED", JSON.stringify(results.popup));
    process.exitCode = 1;
  }

  // What the window looks like.
  const shots = await main(async () => {
    const browser = global.noorTest.browser;
    const chrome = await browser.chrome.webContents.capturePage();
    const page = await browser.selected.webContents.capturePage();
    return { chrome: chrome.toPNG().toString("base64"), page: page.toPNG().toString("base64") };
  });
  results.screenshots = [];
  for (const [name, data] of Object.entries(shots)) {
    const file = path.join(userData, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    results.screenshots.push(file);
  }

  console.log(JSON.stringify(results, null, 2));
  await app.close();
  server.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
