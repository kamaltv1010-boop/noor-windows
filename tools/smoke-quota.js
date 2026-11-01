// Runs Noor and reads the storage quota every way a site can:
// navigator.storage.estimate() in the page, in a worker and in a service
// worker, and the old navigator.webkitTemporaryStorage and
// webkitPersistentStorage. With Clear Everything on Quit (the profile kept
// in memory), and with a profile on a nearly full disk, each must be a
// window of Chrome's quota (see main/quota.js), not one that reads as an
// incognito window's (a part of the memory, less than twice the JS heap
// limit, which the detectIncognito library calls incognito); a private
// tab keeps the incognito one, as Chrome's incognito windows do. Needs
// Playwright and a display: on Linux, `xvfb-run -a node tools/smoke-quota.js`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");
const { diskQuota, quotaFor, shownQuota } = require("../main/quota");

const root = path.join(__dirname, "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SW = "self.addEventListener('message', (e) => navigator.storage.estimate().then((q) => e.source.postMessage(q.quota)));";
/// What a nearly full disk has free, in the second run.
const NEARLY_FULL = 1024 * 1024 * 1024;

// Every way to ask, each answer in bytes (or what went wrong).
const ASK = `(async () => {
  const within = (promise) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve("timeout"), 5000))]);
  const legacy = (storage) => within(new Promise((resolve) => storage.queryUsageAndQuota((usage, quota) => resolve(quota), (error) => resolve("error " + error))));
  const estimate = await navigator.storage.estimate();
  return {
    page: estimate.quota,
    keys: Object.keys(estimate).join(","),
    temporary: await legacy(navigator.webkitTemporaryStorage),
    persistent: await legacy(navigator.webkitPersistentStorage),
    worker: await within(new Promise((resolve) => {
      const worker = new Worker(URL.createObjectURL(new Blob(["navigator.storage.estimate().then((e) => postMessage(e.quota))"], { type: "text/javascript" })));
      worker.onmessage = (event) => resolve(event.data);
    })),
    serviceWorker: await within((async () => {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const worker = registration.installing || registration.waiting || registration.active;
      await new Promise((resolve) => { if (worker.state === "activated") resolve(); worker.addEventListener("statechange", () => worker.state === "activated" && resolve()); });
      return new Promise((resolve) => { navigator.serviceWorker.onmessage = (event) => resolve(event.data); (registration.active || worker).postMessage("quota"); });
    })()),
    heap: performance.memory.jsHeapSizeLimit,
    looks: Function.prototype.toString.call(StorageManager.prototype.estimate) + " " + Function.prototype.toString.call(Object.getPrototypeOf(navigator.webkitTemporaryStorage).queryUsageAndQuota),
    wrongThis: await StorageManager.prototype.estimate.call({}).then(() => "resolved", (error) => error.constructor.name + ": " + error.message),
  };
})()`;

(async () => {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/sw.js")) {
      res.setHeader("content-type", "text/javascript");
      return res.end(SW);
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end("<!doctype html><title>Quota</title><p>quota</p>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const failures = [];
  const check = (name, ok, detail) => {
    if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`);
  };
  const results = {};

  /// One run of the app: `settings` written before it starts, `env` added.
  const launch = async (settings, env) => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-quota-"));
    fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify(settings));
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
    const inTab = (code) => main((electron, source) => global.noorTest.browser.selected.webContents.executeJavaScript(source, true), code);
    const open = async (url, isPrivate) => {
      await main((electron, [target, privately]) => {
        const browser = global.noorTest.browser;
        if (privately) {
          browser.newTab({ isPrivate: true });
          setTimeout(() => browser.selected.load(target), 300);
        } else {
          browser.newTab({ url: target });
        }
      }, [url, Boolean(isPrivate)]);
      await sleep(2500);
    };
    return { app, main, inTab, open, userData };
  };

  /// Each way to ask gave about `expected` (give or take what the disk did
  /// meanwhile), none of them what reads as incognito.
  const checkWays = (label, answers, expected) => {
    const near = (value) => typeof value === "number" && Math.abs(value - expected) < 256 * 1024 * 1024;
    const incognito = (value) => typeof value === "number" && Math.round(value / 1048576) < Math.round(answers.heap / 1048576) * 2;
    for (const way of ["page", "temporary", "persistent", "worker", "serviceWorker"]) {
      check(`${label}: ${way}`, near(answers[way]) && !incognito(answers[way]), { got: answers[way], expected });
    }
    check(`${label}: the estimate's members`, answers.keys === "quota,usage,usageDetails", answers.keys);
    check(`${label}: the replacements look native`, answers.looks === "function estimate() { [native code] } function queryUsageAndQuota() { [native code] }", answers.looks);
    check(`${label}: estimate on the wrong object`, answers.wrongThis === "TypeError: Failed to execute 'estimate' on 'StorageManager': Illegal invocation", answers.wrongThis);
    return incognito;
  };

  // Clear Everything on Quit: the profile kept in memory.
  {
    const run = await launch({ clearOnQuit: true }, {});
    await run.open(base + "kept-in-memory");
    const answers = await run.inTab(ASK);
    const expected = quotaFor(shownQuota(diskQuota(fs.statfsSync(run.userData)), true), 0);
    const incognito = checkWays("a profile in memory", answers, expected);
    results.memory = { expected, answers };

    // A private tab: an incognito window's quota, as in Chrome.
    await run.open(base + "private", true);
    const privateTab = await run.inTab(ASK);
    const isPrivate = await run.main(() => global.noorTest.browser.selected.isPrivate);
    check("the private tab is private", isPrivate, isPrivate);
    for (const way of ["page", "temporary", "worker"]) {
      check(`a private tab: ${way}`, incognito(privateTab[way]), { got: privateTab[way] });
    }
    results.privateTab = privateTab;
    await run.app.close();
  }

  // A profile on disk, on a disk with 1 GiB free: Chromium would show about
  // that, which reads as incognito; pages see 60% of the disk.
  {
    const run = await launch({}, { NOOR_TEST_DISK_FREE: String(NEARLY_FULL) });
    await run.open(base + "nearly-full-disk");
    const answers = await run.inTab(ASK);
    const disk = diskQuota(fs.statfsSync(run.userData));
    const expected = quotaFor(shownQuota(Object.assign({}, disk, { free: NEARLY_FULL }), false), 0);
    check("a nearly full disk shows 60% of it", expected === disk.max, { expected, max: disk.max });
    checkWays("a nearly full disk", answers, expected);
    results.nearlyFullDisk = { expected, answers };
    await run.app.close();
  }

  console.log(JSON.stringify(results, null, 2));
  server.close();
  if (failures.length) {
    console.error("FAILED:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("quota smoke passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
