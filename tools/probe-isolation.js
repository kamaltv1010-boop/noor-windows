// Whether profiles keep apart what sites store, in a build of Noor
// ("windows", "iphone" or "android"): a page of one site writes a cookie,
// localStorage, sessionStorage, IndexedDB, Cache Storage, a service worker
// and the HTTP cache in the first profile; the same site then reads them
// in a second profile and in a private tab (nothing must be there), and a
// shared worker and a BroadcastChannel must not join two profiles. After
// a restart the first profile still has its own, the second still nothing.
// Prints what each read; exits 1 if anything crossed.
// Needs Playwright and a display: `xvfb-run -a node tools/probe-isolation.js [windows|iphone|android]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const BUILD = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PAGE = `<!doctype html><title>isolation</title><script>
const idb = (write) => new Promise((resolve) => {
  const open = indexedDB.open("noor-probe", 1);
  open.onupgradeneeded = () => open.result.createObjectStore("s");
  open.onerror = () => resolve("ERR " + open.error);
  open.onsuccess = () => {
    const tx = open.result.transaction("s", "readwrite");
    const store = tx.objectStore("s");
    if (write) store.put("A", "k");
    const get = store.get("k");
    tx.oncomplete = () => { resolve(get.result || null); open.result.close(); };
    tx.onerror = () => resolve("ERR " + tx.error);
  };
});
// What another site's frame in this page keeps (its own storage, under
// this page's site), and what a worker of this page keeps.
const viaFrame = (mode) => new Promise((resolve) => {
  const frame = document.createElement("iframe");
  frame.src = location.protocol + "//other.test:" + location.port + "/frame?mode=" + mode;
  const done = (e) => { if (e.data && e.data.frame) { removeEventListener("message", done); frame.remove(); resolve(e.data.frame); } };
  addEventListener("message", done);
  document.body.appendChild(frame);
  setTimeout(() => resolve("timeout"), 8000);
});
const viaWorker = (mode) => new Promise((resolve) => {
  const worker = new Worker("/worker.js");
  worker.onmessage = (e) => { worker.terminate(); resolve(e.data); };
  worker.onerror = (e) => resolve("ERR " + e.message);
  worker.postMessage(mode);
  setTimeout(() => resolve("timeout"), 8000);
});
window.write = async () => {
  document.cookie = "probe=A; max-age=3600; path=/";
  localStorage.setItem("probe", "A");
  sessionStorage.setItem("probe", "A");
  await idb(true);
  await (await caches.open("probe")).put("/cached-entry", new Response("A"));
  await navigator.serviceWorker.register("/sw.js");
  await fetch("/http-cached");
  await viaFrame("write");
  await viaWorker("write");
  return window.read();
};
window.read = async () => ({
  cookie: document.cookie,
  local: localStorage.getItem("probe"),
  session: sessionStorage.getItem("probe"),
  idb: await idb(false),
  cache: await caches.has("probe"),
  sw: (await navigator.serviceWorker.getRegistrations()).length,
  httpCache: await fetch("/http-cached").then((r) => r.text()),
  frame: await viaFrame("read"),
  worker: await viaWorker("read"),
});
window.together = async () => {
  const shared = await new Promise((resolve) => { const s = new SharedWorker("/count.js"); s.port.onmessage = (e) => resolve(e.data); s.port.start(); setTimeout(() => resolve("timeout"), 5000); });
  return { shared };
};
window.listen = () => { window.heard = []; const c = new BroadcastChannel("noor-probe"); c.onmessage = (e) => window.heard.push(e.data); return true; };
window.say = () => { new BroadcastChannel("noor-probe").postMessage("from " + location.port); return true; };
</script><p>isolation</p>`;

(async () => {
  let httpHits = 0;
  const web = http.createServer((req, res) => {
    const url = req.url.split("?")[0];
    const send = (type, body, extra = {}) => { res.setHeader("content-type", type); for (const [k, v] of Object.entries(extra)) res.setHeader(k, v); res.end(body); };
    if (url === "/sw.js") return send("text/javascript", "self.addEventListener('install', () => self.skipWaiting());", { "cache-control": "no-store" });
    if (url === "/count.js") return send("text/javascript", "let n = 0; onconnect = (e) => { n++; e.ports[0].postMessage(n); };", { "cache-control": "no-store" });
    // The other site's frame: its localStorage and IndexedDB, written or read.
    if (url === "/frame") return send("text/html", `<!doctype html><script>
const idb = (write) => new Promise((resolve) => { const open = indexedDB.open("noor-frame", 1); open.onupgradeneeded = () => open.result.createObjectStore("s"); open.onerror = () => resolve("ERR"); open.onsuccess = () => { const tx = open.result.transaction("s", "readwrite"); const store = tx.objectStore("s"); if (write) store.put("F", "k"); const get = store.get("k"); tx.oncomplete = () => { resolve(get.result || null); open.result.close(); }; tx.onerror = () => resolve("ERR"); }; });
(async () => { const write = new URLSearchParams(location.search).get("mode") === "write"; let local; try { if (write) localStorage.setItem("probe", "F"); local = localStorage.getItem("probe"); } catch (e) { local = "ERR " + e.name; } parent.postMessage({ frame: { local, idb: await idb(write) } }, "*"); })();
</script>`, { "cache-control": "no-store" });
    // The page's worker: IndexedDB written or read from inside it.
    if (url === "/worker.js") return send("text/javascript", `const idb = (write) => new Promise((resolve) => { const open = indexedDB.open("noor-worker", 1); open.onupgradeneeded = () => open.result.createObjectStore("s"); open.onerror = () => resolve("ERR"); open.onsuccess = () => { const tx = open.result.transaction("s", "readwrite"); const store = tx.objectStore("s"); if (write) store.put("W", "k"); const get = store.get("k"); tx.oncomplete = () => { resolve(get.result || null); open.result.close(); }; tx.onerror = () => resolve("ERR"); }; });
onmessage = async (e) => postMessage({ idb: await idb(e.data === "write") });`, { "cache-control": "no-store" });
    if (url === "/http-cached") { httpHits++; return send("text/plain", "hit " + httpHits, { "cache-control": "max-age=3600" }); }
    send("text/html", PAGE, { "cache-control": "no-store" });
  });
  await new Promise((resolve) => web.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${web.address().port}/`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-isolation-"));
  const launch = () => electron.launch({
    executablePath: require(path.join(root, "node_modules", "electron")),
    args: [root, "--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1"],
    env: { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: userData, NOOR_DEVICE: BUILD, NOOR_TEST_TIMEZONE: "Africa/Casablanca" },
  });
  const ready = async (app) => {
    for (let i = 0; i < 200; i++) {
      if (await app.evaluate(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) return;
      await sleep(100);
    }
  };
  // A tab with the page, once its calls are there (its page loaded): not
  // after a fixed wait (in run 41521783891 two seconds weren't enough on
  // Windows, and window.write wasn't there yet), 20 s at most.
  const open = async (app, isPrivate = false) => {
    await app.evaluate((electron, [url, priv]) => { global.noorTest.browser.newTab({ url, isPrivate: priv }); }, [base, isPrivate]);
    for (let i = 0; i < 80; i++) {
      const loaded = await app.evaluate(() => global.noorTest.browser.selected.webContents.executeJavaScript("typeof window.write === 'function' && typeof window.read === 'function' && document.readyState === 'complete'")).catch(() => false);
      if (loaded) break;
      await sleep(250);
    }
    await sleep(300);
  };
  const run = (app, code) => app.evaluate((electron, source) => global.noorTest.browser.selected.webContents.executeJavaScript(source, true), code);
  const profileName = (app) => app.evaluate(() => global.noorTest.browser.profile.name);

  const result = { build: BUILD };
  let app = await launch();
  await ready(app);
  await open(app);
  result.first = { profile: await profileName(app), wrote: await run(app, "window.write()") };
  result.first.together = await run(app, "window.together()");
  await run(app, "window.listen()");
  await open(app, true);
  result.privateTab = await run(app, "window.read()");
  await app.evaluate(() => global.noorTest.browser.createProfile("Second"));
  await sleep(1500);
  await open(app);
  result.second = { profile: await profileName(app), read: await run(app, "window.read()"), together: await run(app, "window.together()"), said: await run(app, "window.say()") };
  await sleep(500);
  // Back in the first profile's window: did it hear the second one?
  result.heardInFirst = await app.evaluate(async () => {
    const all = global.noorTest.windows.shown || [];
    const firstWindow = all.find((w) => w.profile && w.profile.name !== "Second");
    if (!firstWindow) return "no first window";
    const tab = firstWindow.tabs.find((t) => t.webContents && /127\.0\.0\.1/.test(t.webContents.getURL()));
    return tab ? tab.webContents.executeJavaScript("window.heard", true) : "no tab";
  });
  await app.close().catch(() => {});

  // After a restart.
  app = await launch();
  await ready(app);
  result.afterRestart = {};
  for (const name of [await profileName(app)]) {
    await open(app);
    result.afterRestart[name] = await run(app, "window.read()");
  }
  // And the first profile's window, opened again: what it kept.
  const firstName = await app.evaluate((electron, name) => {
    const w = global.noorTest.windows;
    const profile = w.profiles.all().find((p) => p.name === name);
    if (profile) w.open(profile);
    return profile ? profile.name : null;
  }, result.first.profile);
  await sleep(2500);
  if (firstName && !result.afterRestart[firstName]) {
    await open(app);
    result.afterRestart[firstName] = await run(app, "window.read()");
  }
  await app.close().catch(() => {});
  web.close();

  const problems = [];
  // (Another site's frame and the page's worker: nothing of the first profile's.)
  const nothingElsewhere = (r) => r.frame && r.frame.local === null && r.frame.idb === null && r.worker && r.worker.idb === null;
  const empty = (r) => !/probe=A/.test(r.cookie) && r.local === null && r.session === null && r.idb === null && r.cache === false && r.sw === 0 && nothingElsewhere(r);
  const wrote = result.first.wrote;
  if (!(/probe=A/.test(wrote.cookie) && wrote.local === "A" && wrote.session === "A" && wrote.idb === "A" && wrote.cache === true && wrote.sw === 1)) problems.push(`the first profile didn't keep what it wrote: ${JSON.stringify(wrote)}`);
  if (!(wrote.frame && wrote.frame.local === "F" && wrote.frame.idb === "F" && wrote.worker && wrote.worker.idb === "W")) problems.push(`the first profile's other-site frame or worker didn't keep what it wrote: ${JSON.stringify({ frame: wrote.frame, worker: wrote.worker })}`);
  // After the restart: the first profile kept all it wrote, its frame's and
  // worker's too; the second still has nothing.
  const kept = result.afterRestart[result.first.profile];
  if (!kept) problems.push("after the restart, the first profile's window didn't open");
  else if (!(/probe=A/.test(kept.cookie) && kept.local === "A" && kept.idb === "A" && kept.frame && kept.frame.local === "F" && kept.worker && kept.worker.idb === "W")) problems.push(`after the restart, the first profile lost what it kept: ${JSON.stringify(kept)}`);
  const stillEmpty = result.afterRestart[result.second.profile];
  if (stillEmpty && !empty(stillEmpty)) problems.push(`after the restart, the second profile read the first's data: ${JSON.stringify(stillEmpty)}`);
  if (!empty(result.privateTab)) problems.push(`a private tab read the profile's data: ${JSON.stringify(result.privateTab)}`);
  if (result.second.profile === result.first.profile) problems.push("the second profile's window wasn't the second profile");
  if (!empty(result.second.read)) problems.push(`the second profile read the first's data: ${JSON.stringify(result.second.read)}`);
  if (result.second.read.httpCache !== "hit 2" && result.second.read.httpCache !== "hit 3") problems.push(`the second profile got the first's HTTP cache: ${result.second.read.httpCache}`);
  if (result.second.together.shared !== 1) problems.push(`a shared worker joined two profiles: ${JSON.stringify(result.second.together)}`);
  if (Array.isArray(result.heardInFirst) && result.heardInFirst.length) problems.push(`a BroadcastChannel joined two profiles: ${JSON.stringify(result.heardInFirst)}`);
  result.problems = problems;
  console.log(JSON.stringify(result, null, 2));
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
