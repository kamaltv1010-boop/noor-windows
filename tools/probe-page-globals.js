// Whether a site's code anywhere reaches what Noor's own code has: Node's
// require, process, Buffer, module, Electron's ipcRenderer, webFrame,
// contextBridge, the app's window.noor (Noor's pages' calls), or a name of
// the protection's own. Noor's tabs run the preload in the page's own
// world (contextIsolation off, so the protection can reach the page's
// built-ins): whatever it left in reach of the page would let a site read
// files or drive the app. Looked for in the page, a frame of the site's (by
// address, by srcdoc, an empty one a script made), another site's frame, a
// window the page opened, an empty window it opened and ran its code in
// (Chromium keeps that first document of a window for a page of its site),
// a dedicated, a shared and a service worker. Noor lets a page open a window
// just after the user's click (tabs.js, opensWindow); this test lets it open
// them by itself (NOOR_TEST_OPEN_WINDOWS), as tools/probe-workers.js does.
// And a page that replaced the built-ins (Array.prototype.push, Function's
// call and apply, Object's, Reflect's, …), as a site's may with
// contextIsolation off, then gets messages from the app: Electron's own
// code that hands a message to the frame ran in the page's world in older
// versions (an EventEmitter's emit pushing { sender: ipcRenderer } through
// the page's push), giving the page ipcRenderer; in Electron 45 it is
// native code. Whatever the replaced built-ins catch with a sender's send,
// sendSync or invoke is counted.
// Prints what each context has; exits 1 if any has one of them.
// Needs Playwright and a display:
// `xvfb-run -a node tools/probe-page-globals.js [windows|iphone|android]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const BUILD = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const NAMES = ["require", "process", "Buffer", "global", "module", "exports", "__dirname", "__filename", "ipcRenderer", "webFrame", "contextBridge", "electron", "noor", "noorTest", "protectPage", "protectSource", "noorProtect"];
// What a context has of them, as a string (none: "").
const LOOK = `(() => { const self_ = typeof globalThis !== "undefined" ? globalThis : self; const found = ${JSON.stringify(NAMES)}.filter((name) => { try { return typeof self_[name] !== "undefined"; } catch (e) { return false; } }); const own = Object.getOwnPropertyNames(self_).filter((name) => /^_[0-9a-f]{20,}$|noor|electron/i.test(name)); return Array.from(new Set(found.concat(own))).join(","); })()`;

// The page that replaces the built-ins: it keeps what any of them is
// handed (this, the arguments) that is, or carries, an IPC object.
const TRAP = `<!doctype html><title>replaced built-ins</title><script>
window.__caught = [];
window.__wrapped = 0;
const realPush = Array.prototype.push;
const RA = Reflect.apply;
let busy = false;
const seen = (value, how) => {
  if (busy) return;
  busy = true;
  try {
    if (value && typeof value === "object") {
      const ipcLike = (o) => o && (typeof o.send === "function" || typeof o.sendSync === "function" || typeof o.invoke === "function") && (typeof o.on === "function" || typeof o.sendSync === "function");
      if (ipcLike(value.sender)) realPush.call(window.__caught, how + ": a sender with send");
      else if (ipcLike(value) && value !== window && !(value instanceof EventTarget)) realPush.call(window.__caught, how + ": an IPC-like object");
    }
  } catch (e) {} finally { busy = false; }
};
const wrapAll = (holder, label) => {
  for (const key of Reflect.ownKeys(holder)) {
    if (key === "constructor") continue;
    let d; try { d = Object.getOwnPropertyDescriptor(holder, key); } catch (e) { continue; }
    if (!d || typeof d.value !== "function" || !d.configurable) continue;
    const orig = d.value;
    const name = label + "." + String(key);
    const wrapped = function (...args) { seen(this, name + " this"); for (let i = 0; i < args.length; i++) seen(args[i], name + " argument"); return new.target ? Reflect.construct(orig, args, new.target) : RA(orig, this, args); };
    try { Object.defineProperty(holder, key, { ...d, value: wrapped }); window.__wrapped++; } catch (e) {}
  }
};
for (const [holder, label] of [[Array.prototype, "Array.prototype"], [Function.prototype, "Function.prototype"], [Object, "Object"], [Object.prototype, "Object.prototype"], [Promise.prototype, "Promise.prototype"], [Promise, "Promise"], [Map.prototype, "Map.prototype"], [Set.prototype, "Set.prototype"], [WeakMap.prototype, "WeakMap.prototype"], [JSON, "JSON"], [String.prototype, "String.prototype"], [Reflect, "Reflect"], [Array, "Array"], [Symbol, "Symbol"], [Error, "Error"], [EventTarget.prototype, "EventTarget.prototype"]]) wrapAll(holder, label);
for (const name of ["sender", "ports", "senderId", "processId", "frameId", "_events"]) {
  try { Object.defineProperty(Object.prototype, name, { configurable: true, get() { seen(this, "a getter of " + name); return undefined; }, set(v) { Object.defineProperty(this, name, { value: v, writable: true, enumerable: true, configurable: true }); } }); } catch (e) {}
}
// The check itself: what the page hands a replaced built-in is caught.
[].push({ sender: { send() {}, on() {} } });
window.__control = window.__caught.length === 1;
window.__caught.length = 0;
</script>`;

(async () => {
  let port;
  const said = {};
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => { try { const r = JSON.parse(body); said[r.where] = r.found; } catch (e) {} res.end("ok"); });
      return;
    }
    const tell = (where) => `fetch("/report", { method: "POST", body: JSON.stringify({ where: ${JSON.stringify(where)}, found: ${LOOK} }) });`;
    const send = (type, body) => { res.setHeader("content-type", type); res.setHeader("cache-control", "no-store"); res.end(body); };
    if (url.pathname === "/trap") return send("text/html", TRAP);
    if (url.pathname === "/frame") return send("text/html", `<!doctype html><script>${tell("a frame of the site's")}</script>`);
    if (url.pathname === "/other") return send("text/html", `<!doctype html><script>${tell("another site's frame")}</script>`);
    if (url.pathname === "/opened") return send("text/html", `<!doctype html><script>${tell("a window it opened")}</script>`);
    if (url.pathname === "/worker.js") return send("text/javascript", tell("a dedicated worker"));
    if (url.pathname === "/shared.js") return send("text/javascript", `${tell("a shared worker")} onconnect = () => {};`);
    if (url.pathname === "/sw.js") return send("text/javascript", `self.addEventListener("install", () => self.skipWaiting()); self.addEventListener("activate", (e) => e.waitUntil(clients.claim())); ${tell("a service worker")}`);
    send("text/html", `<!doctype html><title>globals</title><body>
<iframe src="/frame"></iframe>
<iframe srcdoc="<script>parent.__srcdoc = ${LOOK.replace(/"/g, "&quot;")};</script>"></iframe>
<iframe src="http://other.localhost:${port}/other"></iframe>
<script>
${tell("the page")}
const empty = document.createElement("iframe"); document.body.appendChild(empty);
setTimeout(() => { let found = ""; try { found = empty.contentWindow.eval(${JSON.stringify(LOOK)}); } catch (e) { found = "ERR " + e.message; } fetch("/report", { method: "POST", body: JSON.stringify({ where: "an empty frame it made", found }) }); }, 300);
setTimeout(() => fetch("/report", { method: "POST", body: JSON.stringify({ where: "a frame by srcdoc", found: String(window.__srcdoc) }) }), 1500);
new Worker("/worker.js");
try { new SharedWorker("/shared.js").port.start(); } catch (e) {}
navigator.serviceWorker.register("/sw.js");
setTimeout(() => window.open("/opened"), 200);
setTimeout(() => { let found = ""; try { const blank = window.open(""); found = blank.eval(${JSON.stringify(LOOK)}); blank.close(); } catch (e) { found = "ERR " + e.message; } fetch("/report", { method: "POST", body: JSON.stringify({ where: "an empty window it opened", found }) }); }, 800);
</script>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-globals-"));
  const env = { ...process.env, NOOR_TEST: "1", NOOR_TEST_TIMEZONE: "Africa/Casablanca", NOOR_USER_DATA: userData, NOOR_DEVICE: BUILD, NOOR_TEST_OPEN_WINDOWS: "1" };
  const app = await electron.launch({ executablePath: require(path.join(root, "node_modules", "electron")), args: [root, "--no-sandbox"], env });
  for (let i = 0; i < 200; i++) {
    if (await app.evaluate(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  await sleep(1000);
  // The check itself: Noor's own start page has window.noor (its calls),
  // which the same look must find there.
  const { found: own, caught } = await app.evaluate(async (electron, [url, look]) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const browser = global.noorTest.browser;
    const start = browser.tabs.find((tab) => /^noor:\/\/app\//.test(tab.webContents.getURL()));
    const found = start ? await start.webContents.executeJavaScript(look).catch((error) => "ERR " + error.message) : "no page of Noor's";
    browser.newTab({ url });
    await wait(6000);
    // The page with the built-ins replaced, sent messages as the app sends
    // its own pages (webContents.send, a frame's send).
    const trap = browser.newTab({ url: url + "trap" });
    await wait(2500);
    try {
      trap.webContents.send("noor:state", { a: 1 }, "two");
      trap.webContents.mainFrame.send("noor:toast", "a toast", { b: 2 });
      trap.webContents.mainFrame.send("crx-runtime.onMessage", { c: 3 });
    } catch (error) {}
    await wait(1000);
    const caught = await trap.webContents.executeJavaScript("JSON.stringify({ caught: window.__caught, wrapped: window.__wrapped, control: window.__control })").then(JSON.parse, (error) => ({ error: error.message }));
    return { found, caught };
  }, [`http://site.localhost:${port}/`, LOOK]).then((r) => r, (error) => ({ found: "ERR " + error.message, caught: { error: error.message } }));
  await app.close().catch(() => {});
  server.close();

  const WHERE = ["the page", "a frame of the site's", "a frame by srcdoc", "an empty frame it made", "another site's frame", "a window it opened", "an empty window it opened", "a dedicated worker", "a shared worker", "a service worker"];
  const problems = [];
  console.log(`${"Noor's own page (the check)".padEnd(28)} ${own || "none of them"}`);
  if (!/(^|,)noor(,|$)/.test(String(own))) problems.push(`the look found no window.noor in Noor's own page (${own}): it would miss one in a site's`);
  const trapSaid = caught && Array.isArray(caught.caught) ? (caught.caught.length ? Array.from(new Set(caught.caught)).join("; ") : "") : undefined;
  if (trapSaid === undefined) {
    problems.push(`the page with replaced built-ins: nothing reported (${JSON.stringify(caught)})`);
  } else if (!(caught.wrapped > 100) || !caught.control) {
    problems.push(`the page with replaced built-ins replaced ${caught.wrapped} (caught its own: ${caught.control}): the check didn't run`);
  } else if (trapSaid) {
    problems.push(`the page with replaced built-ins caught IPC: ${trapSaid}`);
  }
  console.log(`${"replaced built-ins, a message".padEnd(28)} ${trapSaid === undefined ? "NOTHING REPORTED" : trapSaid || `none of them (${caught.wrapped} built-ins replaced)`}`);
  for (const where of WHERE) {
    const found = said[where];
    if (found === undefined) {
      problems.push(`${where}: nothing reported`);
      console.log(`${where.padEnd(28)} NOTHING REPORTED`);
      continue;
    }
    if (found) problems.push(`${where} has ${found}`);
    console.log(`${where.padEnd(28)} ${found || "none of them"}`);
  }
  console.log(problems.length ? `PAGE GLOBALS: ${problems.join(" | ")}` : "PAGE GLOBALS: no site's code reaches Node, Electron or the app's calls anywhere");
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
