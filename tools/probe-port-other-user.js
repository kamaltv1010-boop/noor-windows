// Whether another Windows account on the same PC can get into Noor through
// Chromium's debugging port (see PROGRESS.md: 127.0.0.1 is the same for
// every account). A built Noor is started (this account); a page in it
// sets a cookie with a secret value; a second, ordinary Windows account is
// made, and a program run as that account looks for the port (as a scan
// would, or as here, given it) and, through it, for the browser's pages
// and that cookie.
// The account is deleted at the end. Needs Windows and an administrator
// (to make the account): the CI's Windows machine is one.
//   node tools/probe-port-other-user.js <built Noor.exe>
// Prints what the other account got; exits 1 if it got into Noor (the
// problem shown), 0 if it couldn't, 2 if the check couldn't run.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exe = path.resolve(process.argv[2] || "");
const result = { exe, system: `${os.type()} ${os.release()} (${os.version()})` };
const done = (code) => {
  console.log(JSON.stringify(result, null, 2));
  process.exit(code);
};
if (process.platform !== "win32") {
  result.why = "Windows only";
  done(2);
}

/// What the other account runs: finds Noor's port among 20000–39999 (as
/// a scan would; Noor picks one there), then asks the browser for its pages
/// and for the cookies of the page's profile. Plain Node, no package.
const OTHER = String.raw`
const fs = require("fs");
const http = require("http");
const out = { who: require("os").userInfo().username };
const get = (port, p) => new Promise((resolve) => {
  const req = http.get({ host: "127.0.0.1", port, path: p, timeout: 400 }, (res) => { let body = ""; res.on("data", (c) => (body += c)); res.on("end", () => resolve(body)); });
  req.on("error", () => resolve(null));
  req.on("timeout", () => { req.destroy(); resolve(null); });
});
(async () => {
  // (The port is given, to keep the check short; a program finds it by
  // trying 20000–39999, many at a time, in a minute or two.)
  const port = Number(process.argv[2]);
  const body = await get(port, "/json/version");
  if (body && body.includes("webSocketDebuggerUrl")) { out.port = port; out.version = JSON.parse(body); }
  if (out.version) {
    const ws = new WebSocket(out.version.webSocketDebuggerUrl);
    let id = 0; const pending = new Map();
    const send = (method, params = {}) => new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params })); });
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.error ? { error: m.error.message } : m.result); pending.delete(m.id); } };
    await new Promise((resolve) => { ws.onopen = resolve; ws.onerror = () => { out.socket = "refused"; resolve(); }; });
    if (!out.socket) {
      out.socket = "open";
      const targets = await send("Target.getTargets");
      out.pages = (targets.targetInfos || []).filter((t) => t.type === "page").map((t) => ({ url: t.url, title: t.title, context: t.browserContextId }));
      const page = out.pages.find((p) => /secret-page/.test(p.url));
      if (page) {
        const cookies = await send("Storage.getCookies", { browserContextId: page.context });
        out.cookies = (cookies.cookies || []).map((c) => c.name + "=" + c.value);
      }
      ws.close();
    }
  }
  fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 2));
  process.exit(0);
})();
`;

(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "noor-other-"));
  const secret = "noor-secret-" + crypto.randomBytes(8).toString("hex");
  const site = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.setHeader("set-cookie", `login=${secret}; Max-Age=3600; Path=/; HttpOnly`);
    res.end("<!doctype html><title>secret page</title><p>a page with a login cookie</p>");
  });
  await new Promise((resolve) => site.listen(0, "127.0.0.1", resolve));
  const env = { ...process.env, NOOR_USER_DATA: data };
  delete env.NOOR_TEST;
  const app = spawn(exe, [], { env, stdio: "ignore" });
  const portFile = path.join(data, "DevToolsActivePort");
  for (let i = 0; i < 400 && !fs.existsSync(portFile); i++) await sleep(100);
  if (!fs.existsSync(portFile)) {
    result.why = "Noor didn't start (no DevToolsActivePort)";
    spawnSync("taskkill", ["/F", "/T", "/PID", String(app.pid)]);
    return done(2);
  }
  await sleep(3000);
  const port = Number(fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0]);
  result.port = port;
  const second = spawn(exe, [`http://127.0.0.1:${site.address().port}/secret-page`], { env, stdio: "ignore" });
  await new Promise((resolve) => second.on("exit", resolve));
  await sleep(4000);

  // The other account, an ordinary user, with a password of its own.
  const user = "noorprobe";
  const password = "Np-" + crypto.randomBytes(9).toString("base64url") + "9!";
  spawnSync("net", ["user", user, "/delete"], { stdio: "ignore" });
  const made = spawnSync("net", ["user", user, password, "/add"], { encoding: "utf8" });
  result.account = made.status === 0 ? `${user} (an ordinary user, made for this check)` : `couldn't be made: ${(made.stderr || made.stdout).trim()}`;
  if (made.status !== 0) {
    spawnSync("taskkill", ["/F", "/T", "/PID", String(app.pid)]);
    return done(2);
  }
  // A folder both accounts reach, with Node and the program in it.
  const shared = path.join(process.env.PUBLIC || "C:\\Users\\Public", "noor-other-" + crypto.randomBytes(4).toString("hex"));
  fs.mkdirSync(shared, { recursive: true });
  fs.copyFileSync(process.execPath, path.join(shared, "node.exe"));
  fs.writeFileSync(path.join(shared, "other.js"), OTHER);
  spawnSync("icacls", [shared, "/grant", `${user}:(OI)(CI)M`], { stdio: "ignore" });
  const answer = path.join(shared, "answer.json");
  const ps = [
    `$secure = ConvertTo-SecureString '${password}' -AsPlainText -Force`,
    `$cred = New-Object System.Management.Automation.PSCredential('${os.hostname()}\\${user}', $secure)`,
    `$p = Start-Process -FilePath '${path.join(shared, "node.exe")}' -ArgumentList @('${path.join(shared, "other.js")}', '${port}', '${answer}') -Credential $cred -WorkingDirectory '${shared}' -WindowStyle Hidden -PassThru -Wait`,
    `"exit $($p.ExitCode)"`,
  ].join("; ");
  const ran = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8", timeout: 600000 });
  result.ranAsOtherAccount = (ran.stdout + ran.stderr).trim().slice(0, 600);
  let got = null;
  try {
    got = JSON.parse(fs.readFileSync(answer, "utf8"));
  } catch (error) {
    got = null;
  }
  result.otherAccountGot = got;

  spawnSync("taskkill", ["/T", "/PID", String(app.pid)]);
  await sleep(3000);
  spawnSync("taskkill", ["/F", "/T", "/PID", String(app.pid)], { stdio: "ignore" });
  spawnSync("net", ["user", user, "/delete"], { stdio: "ignore" });
  fs.rmSync(shared, { recursive: true, force: true });
  site.close();
  if (!got) {
    result.why = "the program run as the other account gave no answer";
    return done(2);
  }
  result.gotIn = Boolean(got.version && got.socket === "open");
  result.sawTheCookie = Boolean(got.cookies && got.cookies.some((c) => c.includes(secret)));
  done(result.gotIn ? 1 : 0);
})().catch((error) => {
  result.why = String((error && error.stack) || error);
  done(2);
});
