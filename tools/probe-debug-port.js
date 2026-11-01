// Whether a web page, or another computer, can reach Chromium's debugging
// port, which Noor opens for the workers no tab's debugger reaches (see
// main/browser-debugger.js): whoever is let in controls the whole browser
// (every profile's pages and cookies). Noor is started as a user starts
// it; the port and the browser's address are read from the file Chromium
// writes (DevToolsActivePort) and given to the page, as the worst case (a
// page that somehow knew them). The page tries to read /json/version, to
// open a tab (PUT /json/new) and to open the browser's WebSocket; then
// this computer's other addresses are tried for the port. Twice: as a
// local page (the worst case) and as a site on the internet (Chromium is
// told the test server's address is public).
// Prints what each try did; exits 1 if a page or another address got in.
// Needs a display: `xvfb-run -a node tools/probe-debug-port.js`;
// NOOR_ELECTRON=<a built Noor> runs that instead of node_modules' Electron.
"use strict";
const fs = require("fs");
const os = require("os");
const net = require("net");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const electronPath = process.env.NOOR_ELECTRON ? path.resolve(process.env.NOOR_ELECTRON) : require(path.join(root, "node_modules", "electron"));
const appArgs = fs.existsSync(path.join(path.dirname(electronPath), "resources", "app.asar")) ? [] : [root];

/// What the page tries, given the port and the browser's path.
const PAGE = (port, browserPath) => `<!doctype html><title>port</title><script>
const P = ${port}, PATH = ${JSON.stringify(browserPath)};
const outcome = (promise) => promise.then((v) => v, (e) => "blocked: " + (e && e.name) + " " + (e && e.message));
(async () => {
  const out = {};
  out.readVersion = await outcome(fetch("http://127.0.0.1:" + P + "/json/version").then((r) => r.text()).then((t) => "READ: " + t.slice(0, 80)));
  out.noCors = await outcome(fetch("http://127.0.0.1:" + P + "/json/version", { mode: "no-cors" }).then((r) => "answered (" + r.type + ", unreadable)"));
  out.openTab = await outcome(fetch("http://127.0.0.1:" + P + "/json/new?about:blank#noor-probe", { method: "PUT" }).then((r) => r.text()).then((t) => "OPENED: " + t.slice(0, 80)));
  out.socket = await new Promise((resolve) => {
    let ws;
    try { ws = new WebSocket("ws://127.0.0.1:" + P + PATH); } catch (e) { resolve("blocked: " + e.message); return; }
    ws.onopen = () => { ws.send(JSON.stringify({ id: 1, method: "Target.getTargets" })); };
    ws.onmessage = (e) => { resolve("OPEN, the browser answered: " + String(e.data).slice(0, 80)); ws.close(); };
    ws.onerror = () => resolve("refused");
    setTimeout(() => resolve("no answer"), 5000);
  });
  await fetch("/report", { method: "POST", body: JSON.stringify(out) });
})();
</script>`;

/// Starts Noor (on its own data), opens the page in it, gives back what the
/// page reported, and whether the port answers on this computer's other
/// addresses.
const run = async (asPublic) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-port-"));
  let reported = null;
  let debug = null;
  const web = http.createServer((req, res) => {
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => { try { reported = JSON.parse(body); } catch (e) {} res.end("ok"); });
      return;
    }
    res.setHeader("content-type", "text/html");
    res.setHeader("cache-control", "no-store");
    res.end(PAGE(debug.port, debug.path));
  });
  await new Promise((resolve) => web.listen(0, "127.0.0.1", resolve));
  const webPort = web.address().port;
  const env = { ...process.env, NOOR_USER_DATA: userData, NOOR_DEVICE: "windows", NOOR_TEST_OPEN_WINDOWS: "1" };
  delete env.NOOR_TEST;
  const args = [...appArgs, "--no-sandbox"];
  if (asPublic) args.push(`--ip-address-space-overrides=127.0.0.1:${webPort}=public`);
  const app = spawn(electronPath, args, { env, stdio: "ignore" });
  const exited = new Promise((resolve) => app.on("exit", resolve));
  const file = path.join(userData, "DevToolsActivePort");
  for (let i = 0; i < 100 && !fs.existsSync(file); i++) await sleep(100);
  await sleep(4000);
  const [port, browserPath] = fs.readFileSync(file, "utf8").split("\n");
  debug = { port: Number(port), path: browserPath };
  const second = spawn(electronPath, [...args, `http://127.0.0.1:${webPort}/probe`], { env, stdio: "ignore" });
  await new Promise((resolve) => second.on("exit", resolve));
  for (let i = 0; i < 120 && !reported; i++) await sleep(250);
  // The port, tried from here on this computer's other addresses.
  const others = {};
  for (const list of Object.values(os.networkInterfaces())) {
    for (const entry of list || []) {
      if (entry.internal) continue;
      others[entry.address] = await new Promise((resolve) => {
        const socket = net.connect({ host: entry.address, port: debug.port });
        socket.on("connect", () => { socket.destroy(); resolve("OPEN"); });
        socket.on("error", (e) => resolve("closed (" + e.code + ")"));
        setTimeout(() => { socket.destroy(); resolve("no answer"); }, 3000);
      });
    }
  }
  // Whether the page opened a tab after all.
  const list = await fetch(`http://127.0.0.1:${debug.port}/json/list`).then((r) => r.json()).catch(() => []);
  const opened = list.some((target) => /noor-probe/.test(target.url || ""));
  app.kill("SIGTERM");
  await Promise.race([exited, sleep(15000).then(() => app.kill("SIGKILL"))]);
  web.close();
  fs.rmSync(userData, { recursive: true, force: true });
  return { page: reported || "no report", openedTab: opened, otherAddresses: others, port: debug.port };
};

(async () => {
  const result = { local: await run(false), public: await run(true) };
  const problems = [];
  for (const [where, seen] of Object.entries(result)) {
    if (typeof seen.page !== "object") { problems.push(`${where}: the page reported nothing`); continue; }
    if (/^READ/.test(seen.page.readVersion)) problems.push(`${where}: the page read /json/version`);
    if (/^OPENED/.test(seen.page.openTab) || seen.openedTab) problems.push(`${where}: the page opened a tab`);
    if (/^OPEN/.test(seen.page.socket)) problems.push(`${where}: the page opened the browser's WebSocket`);
    for (const [address, state] of Object.entries(seen.otherAddresses)) if (state === "OPEN") problems.push(`${where}: the port answers on ${address}`);
  }
  result.problems = problems;
  console.log(JSON.stringify(result, null, 2));
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
