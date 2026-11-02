// Whether a site can reach a service of this computer (or of its own
// network: a router's page, a printer's, a tool on localhost), as Chrome
// stops it ("local network access"). Noor refuses a site's requests to an
// address of this computer or network; this checks that a NAME leading
// there is refused too: a name the site points at 127.0.0.1 or 192.168.…
// (public ones exist, 127.0.0.1.nip.io), or its own name pointed there once
// its page is loaded ("DNS rebinding", which lets the site read the
// answers as its own). A service on this computer counts what reaches it.
// The site's page (Content-Security-Policy: treat-as-public-address, as
// Chrome takes a page to be a site's though this test serves it from this
// computer) tries nine ways: fetch by address and by name (read, and
// without reading), an image, a frame, a WebSocket, a beacon, a worker's
// fetch, and its own name. A page of this computer then tries the same
// (it may: a check that the tries reach what they aim at).
// Prints what each did; exits 1 if the site reached the service.
// Needs Playwright and a display: `xvfb-run -a node tools/probe-local-network.js`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const BUILD = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  // The service of this computer's: what reaches it, with its Host.
  const hits = [];
  const service = http.createServer((req, res) => {
    hits.push(`${req.url}${req.headers.upgrade ? " (upgrade)" : ""}`);
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("content-type", req.url.endsWith("-frame") ? "text/html" : "text/plain");
    res.end("SECRET-OF-THIS-COMPUTER");
  });
  await new Promise((resolve) => service.listen(0, "127.0.0.1", resolve));
  const sp = service.address().port;
  const rebound = [];
  const site = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/rebound")) {
      rebound.push(req.url);
      res.setHeader("content-type", "text/plain");
      return res.end("SECRET-OF-THIS-COMPUTER");
    }
    if (url.pathname === "/worker.js") {
      res.setHeader("content-type", "text/javascript");
      return res.end(`fetch("http://svc.test:${sp}/name-worker").then((r) => r.text()).then((t) => postMessage("READ " + t.slice(0, 30)), (e) => postMessage("blocked " + e.message));`);
    }
    const asSite = url.pathname === "/site";
    res.setHeader("content-type", "text/html; charset=utf-8");
    if (asSite) res.setHeader("content-security-policy", "treat-as-public-address");
    res.end(`<!doctype html><title>${asSite ? "a site" : "this computer"}</title><body><script>
window.__results = {};
const note = (name, value) => { window.__results[name] = value; };
const read = (name, url, options) => fetch(url, options).then((r) => r.text()).then((t) => note(name, "READ " + t.slice(0, 30)), (e) => note(name, "blocked " + e.message));
read("fetch by address", "http://127.0.0.1:${sp}/address");
read("fetch by name", "http://svc.test:${sp}/name");
read("fetch by name, not read", "http://svc.test:${sp}/name-nocors", { mode: "no-cors" });
read("its own name (rebound)", "/rebound");
const image = new Image(); image.onload = () => note("image", "loaded"); image.onerror = () => note("image", "blocked"); image.src = "http://svc.test:${sp}/name-image";
const frame = document.createElement("iframe"); frame.src = "http://svc.test:${sp}/name-frame"; document.body.appendChild(frame);
try { const ws = new WebSocket("ws://svc.test:${sp}/name-ws"); ws.onerror = () => note("websocket", "error (as a refused or failed one)"); ws.onopen = () => note("websocket", "OPEN"); } catch (e) { note("websocket", "blocked " + e.message); }
note("beacon", String(navigator.sendBeacon("http://svc.test:${sp}/name-beacon", "x")));
const worker = new Worker("/worker.js"); worker.onmessage = (e) => note("worker's fetch", e.data); worker.onerror = (e) => note("worker's fetch", "worker error " + e.message);
</script>`);
  });
  await new Promise((resolve) => site.listen(0, "127.0.0.1", resolve));
  const pp = site.address().port;

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-localnet-"));
  const env = { ...process.env, NOOR_TEST: "1", NOOR_TEST_TIMEZONE: "Africa/Casablanca", NOOR_USER_DATA: userData, NOOR_DEVICE: BUILD };
  const app = await electron.launch({ executablePath: require(path.join(root, "node_modules", "electron")), args: [root, "--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1"], env });
  for (let i = 0; i < 200; i++) {
    if (await app.evaluate(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  await sleep(1000);

  const visit = async (url) => {
    hits.length = 0;
    rebound.length = 0;
    const said = await app.evaluate(async (electron, address) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const browser = global.noorTest.browser;
      const tab = browser.newTab({ url: address });
      await wait(5000);
      let results = {};
      try { results = await tab.webContents.executeJavaScript("window.__results || {}"); } catch (error) { results = { error: String(error) }; }
      browser.close(tab);
      return results;
    }, url);
    return { said, reached: hits.slice(), rebound: rebound.slice() };
  };
  const result = {
    site: await visit(`http://public.test:${pp}/site`),
    thisComputer: await visit(`http://home.test:${pp}/home`),
  };
  await app.close().catch(() => {});
  service.close();
  site.close();

  const problems = [];
  if (result.site.reached.length) problems.push(`the site reached this computer's service: ${result.site.reached.join(", ")}`);
  if (result.site.rebound.length) problems.push(`the site reached this computer through its own name: ${result.site.rebound.join(", ")}`);
  for (const [name, value] of Object.entries(result.site.said)) {
    if (/^READ|^loaded$|^OPEN$/.test(String(value))) problems.push(`the site's ${name}: ${value}`);
  }
  // The check itself: a page of this computer's own reaches the service.
  if (result.thisComputer.reached.length < 4) problems.push(`a page of this computer reached the service ${result.thisComputer.reached.length} times only: the tries didn't run (${JSON.stringify(result.thisComputer.said)})`);
  for (const [who, r] of Object.entries(result)) {
    console.log(`note ${who === "site" ? "a site" : "this computer's page"}: the service got ${r.reached.length ? r.reached.join(", ") : "nothing"}${r.rebound.length ? "; through its own name " + r.rebound.join(", ") : ""}`);
    for (const [name, value] of Object.entries(r.said)) console.log(`   ${name}: ${value}`);
  }
  console.log(problems.length ? `LOCAL NETWORK: A SITE REACHED THIS COMPUTER (${problems.join(" | ")})` : "LOCAL NETWORK: no site reached a service of this computer");
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
