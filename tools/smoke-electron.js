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
  const server = http.createServer((req, res) => {
    lastHeaders = req.headers;
    res.setHeader("content-type", "text/html");
    res.end(req.url.startsWith("/quiet") ? QUIET : PAGE);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-smoke-"));
  const app = await electron.launch({
    executablePath: require(path.join(root, "node_modules", "electron")),
    args: [root, "--no-sandbox"],
    env: { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: userData },
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
    trackerLoaded: document.getElementById("t").naturalWidth > 0,
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
