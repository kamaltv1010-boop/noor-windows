// What every kind of request tells a site's server of the browser (the
// User-Agent and the client hints, Sec-CH-UA*), against what the page says
// (navigator), in a build of Noor ("windows", "iphone" or "android"): the
// page itself, an image, a script, fetch, a frame of the site, a dedicated
// worker's script and its fetch, a shared worker's, a service worker's
// script and its fetch. The server asks for the detailed hints (Accept-CH),
// as sites do. This computer runs Windows: a request of Noor iPhone's or
// Noor Android's that names Windows (in its User-Agent, its platform hint,
// or Windows' own version) tells the site the real system; Noor iPhone
// sends no hints at all (Safari has none); every request names the
// platform its page does.
// Prints each request's; exits 1 if one tells another system than the
// page's, or Noor iPhone sends a hint. Needs Playwright and a display:
// `xvfb-run -a node tools/probe-request-headers.js [windows|iphone|android]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const BUILD = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const HINTS = ["sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform", "sec-ch-ua-platform-version", "sec-ch-ua-model", "sec-ch-ua-arch", "sec-ch-ua-bitness", "sec-ch-ua-full-version-list", "sec-ch-ua-wow64", "sec-ch-ua-form-factors"];
const ASKED = HINTS.slice(3).map((name) => name.replace(/(^|-)([a-z])/g, (all, dash, letter) => dash + letter.toUpperCase())).join(", ");

const PAGE = `<!doctype html><title>headers</title><body><img src="/image.png?from=page"><script src="/script.js?from=page"></script>
<iframe src="/frame"></iframe>
<script>
window.__said = { userAgent: navigator.userAgent, platform: navigator.platform, data: navigator.userAgentData ? { brands: navigator.userAgentData.brands.map((b) => b.brand).join(","), mobile: navigator.userAgentData.mobile, platform: navigator.userAgentData.platform } : null };
if (navigator.userAgentData) navigator.userAgentData.getHighEntropyValues(["platformVersion", "model", "architecture"]).then((v) => { window.__said.high = v.platform + " " + v.platformVersion + " " + v.model + " " + v.architecture; });
fetch("/fetch?from=page");
const w = new Worker("/worker.js"); w.onmessage = () => {};
try { const s = new SharedWorker("/shared.js"); s.port.start(); } catch (e) {}
navigator.serviceWorker.register("/sw.js").then(async (reg) => {
  const sw = reg.installing || reg.waiting || reg.active;
  if (sw.state !== "activated") await new Promise((r) => sw.addEventListener("statechange", () => sw.state === "activated" && r()));
  (reg.active || sw).postMessage("go");
});
</script>`;

(async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const headers = { "user-agent": req.headers["user-agent"] || "" };
    for (const name of HINTS) if (req.headers[name] !== undefined) headers[name] = req.headers[name];
    seen.push({ request: url.pathname + url.search, headers });
    const send = (type, body) => { res.setHeader("content-type", type); res.setHeader("cache-control", "no-store"); res.end(body); };
    if (url.pathname === "/image.png") return send("image/png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
    if (url.pathname === "/script.js") return send("text/javascript", "void 0;");
    if (url.pathname === "/fetch") return send("text/plain", "ok");
    if (url.pathname === "/frame") return send("text/html", "<!doctype html><script>fetch('/fetch?from=frame')</script>");
    if (url.pathname === "/worker.js") return send("text/javascript", "fetch('/fetch?from=dedicated-worker').then(() => postMessage(1));");
    if (url.pathname === "/shared.js") return send("text/javascript", "fetch('/fetch?from=shared-worker'); onconnect = () => {};");
    if (url.pathname === "/sw.js") return send("text/javascript", "self.addEventListener('install', () => self.skipWaiting()); self.addEventListener('activate', (e) => e.waitUntil(clients.claim())); self.addEventListener('message', () => fetch('/fetch?from=service-worker'));");
    res.setHeader("accept-ch", ASKED);
    send("text/html; charset=utf-8", PAGE);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  // A secure context (localhost), where the browser sends hints.
  const base = `http://headers.localhost:${server.address().port}`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-headers-"));
  const env = { ...process.env, NOOR_TEST: "1", NOOR_TEST_TIMEZONE: "Africa/Casablanca", NOOR_USER_DATA: userData, NOOR_DEVICE: BUILD };
  const app = await electron.launch({ executablePath: require(path.join(root, "node_modules", "electron")), args: [root, "--no-sandbox"], env });
  for (let i = 0; i < 200; i++) {
    if (await app.evaluate(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  await sleep(1000);
  // Twice: the hints a site asked for are sent from its second page on.
  const said = await app.evaluate(async (electron, url) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const browser = global.noorTest.browser;
    const tab = browser.newTab({ url: url + "/first" });
    await wait(4000);
    tab.load(url + "/second");
    await wait(5000);
    return tab.webContents.executeJavaScript("window.__said");
  }, base).catch((error) => ({ error: String(error) }));
  await app.close().catch(() => {});
  server.close();

  const problems = [];
  const pageSystem = BUILD === "iphone" ? "iPhone" : BUILD === "android" ? "Android" : "Windows";
  const second = seen.slice(seen.findIndex((s) => s.request.startsWith("/second")));
  for (const { request, headers } of seen) {
    const told = JSON.stringify(headers);
    const sent = HINTS.filter((name) => headers[name] !== undefined);
    console.log(`${request.padEnd(32)} UA ${String(headers["user-agent"]).replace(/^Mozilla\/5\.0 \(([^)]*)\).*$/, "($1)")}; platform ${headers["sec-ch-ua-platform"] || "-"}; hints: ${sent.length ? sent.map((name) => name.replace("sec-ch-ua", "ua")).join(" ") : "none"}`);
    if (BUILD !== "windows" && /Windows/i.test(told)) problems.push(`${request}: names Windows (${told.slice(0, 200)})`);
    if (BUILD === "iphone" && HINTS.some((name) => headers[name] !== undefined)) problems.push(`${request}: Noor iPhone sent client hints (${HINTS.filter((name) => headers[name] !== undefined).join(", ")})`);
    if (BUILD === "android" && headers["sec-ch-ua-platform"] !== undefined && headers["sec-ch-ua-platform"] !== '"Android"') problems.push(`${request}: platform hint ${headers["sec-ch-ua-platform"]}`);
    if (!new RegExp(pageSystem === "iPhone" ? "iPhone|iPad" : pageSystem, "i").test(headers["user-agent"])) problems.push(`${request}: a User-Agent of another system (${headers["user-agent"]})`);
  }
  // Every kind of request was seen from the second page.
  for (const kind of ["/second", "/image.png", "/script.js", "/fetch?from=page", "/frame", "/fetch?from=frame", "/worker.js", "/fetch?from=dedicated-worker", "/sw.js", "/fetch?from=service-worker"]) {
    if (!second.some((s) => s.request.startsWith(kind))) problems.push(`no ${kind} request was seen (the check didn't run it)`);
  }
  console.log(`THE PAGE SAYS: ${JSON.stringify(said)}`);
  if (said && said.userAgent && !new RegExp(pageSystem === "iPhone" ? "iPhone|iPad" : pageSystem, "i").test(said.userAgent)) problems.push(`the page's own User-Agent: ${said.userAgent}`);
  if (BUILD === "iphone" && said && said.data) problems.push("Noor iPhone's page has navigator.userAgentData (Safari has none)");
  if (BUILD !== "windows" && said && /Windows/i.test(JSON.stringify(said))) problems.push(`the page names Windows: ${JSON.stringify(said)}`);
  console.log(problems.length ? `REQUEST HEADERS: ${problems.length} PROBLEM(S): ${problems.join(" | ")}` : `REQUEST HEADERS: every request tells ${pageSystem}, as its page does`);
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
