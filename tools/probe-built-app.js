// What a user does with Noor, done on a built Noor itself (Noor.exe built
// or installed, Noor iPhone's, Noor Android's): the first start; a second
// profile made, and a page opened in each (as a pinned profile's button
// opens it: --profile=<id>); a setting changed; the app closed as Windows
// closes an app, and opened again; a second launch handing its address to
// the one running. What sites keep (cookies, localStorage, IndexedDB) must
// stay in its profile and survive the restart; what pages may do
// (permissions) must be refused alike in every profile; the setting must
// be kept; no process of Noor may be left once it is closed.
//
// A built Noor takes no test tool (its fuses refuse --inspect), so it is
// driven as its own pages drive it: through Chromium's debugging port
// (the DevToolsActivePort file in its data folder), the toolbar page calls
// window.noor.invoke(...), as its buttons and the Settings page do.
//   node tools/probe-built-app.js <built Noor> [--data <folder> | --own-data <folder>] [--out <folder>]
// --data: the data folder, given to Noor (NOOR_USER_DATA); by default a new
// temporary one. --own-data: Noor's own data folder (as installed, nothing
// given to it: %APPDATA%\Noor for an installed Noor's first start), read by
// this check. --out: where screenshots and what the files said are kept.
// Prints every step; exits 1 if a step didn't do what a user would expect.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; };
const exe = path.resolve(args[0] || "");
const WINDOWS = process.platform === "win32";
const ownData = option("--own-data");
const data = ownData ? path.resolve(ownData) : path.resolve(option("--data") || fs.mkdtempSync(path.join(os.tmpdir(), "noor-built-")));
const out = option("--out") ? path.resolve(option("--out")) : null;
if (out) fs.mkdirSync(out, { recursive: true });
// (Root on Linux needs Chromium's sandbox off; Windows keeps it.)
const launchArgs = !WINDOWS && process.getuid && process.getuid() === 0 ? ["--no-sandbox"] : [];
const env = { ...process.env };
delete env.NOOR_TEST;
delete env.NOOR_DEVICE;
if (!ownData) env.NOOR_USER_DATA = data;

const report = { exe, system: `${os.type()} ${os.release()}${os.version ? " (" + os.version() + ")" : ""}`, data, steps: [], problems: [] };
const step = (name, ok, detail) => {
  report.steps.push({ name, ok, detail });
  console.error(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : ": " + (typeof detail === "string" ? detail : JSON.stringify(detail))}`);
  if (!ok) report.problems.push(`${name}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
};

/// A Chrome DevTools Protocol client on the browser's own WebSocket.
const connect = (port, browserPath) => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${browserPath}`);
  let nextId = 0;
  const pending = new Map();
  ws.onopen = () => resolve({
    send: (method, params = {}, sessionId) => new Promise((done, fail) => {
      const id = ++nextId;
      pending.set(id, { done, fail });
      ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    }),
    close: () => { try { ws.close(); } catch (e) {} },
  });
  ws.onerror = () => reject(new Error("the debugging port refused the connection"));
  ws.onclose = () => { for (const { fail } of pending.values()) fail(new Error("closed")); pending.clear(); };
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { done, fail } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) fail(new Error(message.error.message)); else done(message.result);
    }
  };
});

const evaluate = async (cdp, sessionId, expression) => {
  const answer = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (answer.exceptionDetails) throw new Error((answer.exceptionDetails.exception && answer.exceptionDetails.exception.description) || answer.exceptionDetails.text);
  return answer.result.value;
};

/// Noor's processes still running (Windows: by the .exe's name).
const running = () => {
  if (WINDOWS) {
    const list = spawnSync("tasklist", ["/FI", `IMAGENAME eq ${path.basename(exe)}`, "/FO", "CSV", "/NH"], { encoding: "utf8" }).stdout || "";
    return list.split(/\r?\n/).filter((line) => line.startsWith('"')).length;
  }
  // (Elsewhere: the processes whose program is this one, not those that
  // only name it, as this check does.)
  const program = fs.realpathSync(exe);
  let count = 0;
  for (const pid of fs.readdirSync("/proc").filter((name) => /^\d+$/.test(name))) {
    try {
      if (fs.readlinkSync(`/proc/${pid}/exe`) === program) count++;
    } catch (error) {
      // Gone, or not ours to read.
    }
  }
  return count;
};

/// Whether the process has a window on the screen (Windows: its main
/// window's handle), and its title.
const windowOf = (pid) => {
  if (!WINDOWS) return null;
  const shown = spawnSync("powershell", ["-NoProfile", "-Command", `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { "$($p.MainWindowHandle)|$($p.MainWindowTitle)" }`], { encoding: "utf8" }).stdout.trim();
  const [handle, title] = shown.split("|");
  return { handle: Number(handle) || 0, title: title || "" };
};

/// Starts Noor and waits until its toolbar page answers.
const start = async (label, extra = []) => {
  const portFile = path.join(data, "DevToolsActivePort");
  fs.rmSync(portFile, { force: true });
  const started = Date.now();
  // (What Noor itself writes, with Chromium's warnings and errors: kept in
  // the --out folder, or with its data.)
  const logFile = path.join(out || data, `noor-${label.replace(/[^a-z]+/gi, "-")}.log`);
  const log = fs.openSync(logFile, "a");
  const child = spawn(exe, [...launchArgs, ...extra], { env: { ...env, ELECTRON_ENABLE_LOGGING: "1" }, stdio: ["ignore", log, log] });
  fs.closeSync(log);
  let exitedWith;
  const exited = new Promise((resolve) => child.on("exit", (code, signal) => { exitedWith = signal || code; resolve(exitedWith); }));
  for (let i = 0; i < 400 && !fs.existsSync(portFile) && exitedWith === undefined; i++) await sleep(100);
  if (!fs.existsSync(portFile)) {
    step(`${label}: Noor starts`, false, exitedWith === undefined ? "no DevToolsActivePort after 40 s" : `it exited (${exitedWith})`);
    return null;
  }
  let port;
  let browserPath;
  for (let i = 0; i < 50; i++) {
    [port, browserPath] = fs.readFileSync(portFile, "utf8").split(/\r?\n/);
    if (port && browserPath) break;
    await sleep(100);
  }
  const cdp = await connect(Number(port), browserPath.trim());
  let toolbar = null;
  for (let i = 0; i < 300 && !toolbar; i++) {
    const { targetInfos } = await cdp.send("Target.getTargets");
    for (const target of targetInfos.filter((t) => t.type === "page" && t.url === "noor://app/chrome.html")) {
      const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
      if (await evaluate(cdp, sessionId, "typeof window.noor === 'object' && typeof window.noor.invoke === 'function'").catch(() => false)) {
        toolbar = sessionId;
        break;
      }
    }
    if (!toolbar) await sleep(100);
  }
  const app = { child, exited, cdp, port: Number(port), toolbar, readyMs: Date.now() - started, logFile };
  app.invoke = (channel, ...values) => evaluate(cdp, toolbar, `window.noor.invoke(${JSON.stringify(channel)}, ...${JSON.stringify(values)})`);
  step(`${label}: Noor starts and its toolbar answers`, Boolean(toolbar), `${app.readyMs} ms, debugging port ${port}`);
  return app;
};

/// Closes Noor as Windows closes an app (its windows are sent WM_CLOSE:
/// taskkill without /F; elsewhere SIGTERM), and waits until every process
/// of it is gone.
const close = async (app, label) => {
  app.cdp.close();
  const asked = Date.now();
  if (WINDOWS) spawnSync("taskkill", ["/PID", String(app.child.pid)], { stdio: "ignore" });
  else app.child.kill("SIGTERM");
  const how = await Promise.race([app.exited, sleep(30000).then(() => "still running after 30 s")]);
  let left = running();
  for (let i = 0; i < 50 && left; i++) {
    await sleep(200);
    left = running();
  }
  if (how === "still running after 30 s") {
    // What Chromium still holds (its debugging port still answers while
    // Noor hangs), and what is still running.
    report.hang = report.hang || {};
    report.hang[label] = {
      targets: await fetch(`http://127.0.0.1:${app.port}/json/list`).then((r) => r.json()).then((list) => list.map((t) => `${t.type} ${t.url} "${t.title}"`)).catch((e) => "no answer: " + e.message),
      processes: WINDOWS
        ? (spawnSync("tasklist", ["/FI", `IMAGENAME eq ${path.basename(exe)}`, "/V", "/FO", "CSV", "/NH"], { encoding: "utf8" }).stdout || "").trim().split(/\r?\n/)
        : (spawnSync("ps", ["-eo", "pid,ppid,stat,wchan:20,args", "--sort", "pid"], { encoding: "utf8" }).stdout || "").split("\n").filter((line) => line.includes(exe)).map((line) => line.replace(exe, path.basename(exe)).slice(0, 220)),
    };
  }
  step(`${label}: Noor closes as Windows closes an app`, how !== "still running after 30 s", `in ${Date.now() - asked} ms (${how})`);
  step(`${label}: no process of Noor is left`, left === 0, `${left} left`);
  // An error nothing caught in Noor's main process (written as its stack;
  // Chromium's own lines start with "[").
  const written = fs.existsSync(app.logFile) ? fs.readFileSync(app.logFile, "utf8") : "";
  const errors = written.split(/\r?\n/).filter((line, i, lines) => /^[A-Za-z]*Error\b/.test(line) && /^\s+at /.test(lines[i + 1] || "")).map((line, i) => line.slice(0, 200));
  step(`${label}: no error nothing caught in Noor's main process (its log)`, errors.length === 0, errors.length ? errors : path.basename(app.logFile));
  if (how === "still running after 30 s") {
    if (WINDOWS) spawnSync("taskkill", ["/F", "/T", "/PID", String(app.child.pid)], { stdio: "ignore" });
    else app.child.kill("SIGKILL");
  }
};

/// The test site: a page that writes (or only reads) what a site keeps,
/// asks what it may do, and reports it.
const reports = [];
const PAGE = `<!doctype html><title>built</title><p>Noor built-app check</p><script>
(async () => {
  const q = new URLSearchParams(location.search);
  const out = { tag: q.get("tag"), mode: q.get("mode"), visit: q.get("visit") };
  const db = () => new Promise((resolve) => { const r = indexedDB.open("noor-check", 1); r.onupgradeneeded = () => r.result.createObjectStore("s"); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(null); });
  if (out.mode === "write") {
    document.cookie = "noorcheck=" + out.tag + "; max-age=3600; path=/";
    localStorage.setItem("noorcheck", out.tag);
    const d = await db();
    if (d) await new Promise((resolve) => { const tx = d.transaction("s", "readwrite"); tx.objectStore("s").put(out.tag, "k"); tx.oncomplete = resolve; tx.onerror = resolve; });
  }
  out.cookie = document.cookie;
  out.localStorage = localStorage.getItem("noorcheck");
  const d = await db();
  out.indexedDB = d ? await new Promise((resolve) => { const g = d.transaction("s").objectStore("s").get("k"); g.onsuccess = () => resolve(g.result === undefined ? null : g.result); g.onerror = () => resolve("ERR"); }) : "ERR";
  out.permissions = {};
  for (const name of ["geolocation", "notifications", "camera", "microphone"]) {
    try { out.permissions[name] = (await navigator.permissions.query({ name })).state; } catch (e) { out.permissions[name] = "ERR " + e.name; }
  }
  out.geolocation = await new Promise((resolve) => {
    if (!navigator.geolocation) return resolve("none");
    navigator.geolocation.getCurrentPosition(() => resolve("GRANTED"), (e) => resolve("refused (" + e.code + ")"), { timeout: 4000 });
    setTimeout(() => resolve("no answer"), 6000);
  });
  out.notificationAsked = typeof Notification === "undefined" ? "none" : await Promise.race([Notification.requestPermission(), new Promise((r) => setTimeout(() => r("no answer"), 4000))]);
  out.userAgent = navigator.userAgent;
  await fetch("/report", { method: "POST", body: JSON.stringify(out) });
})();
</script>`;

const site = http.createServer((req, res) => {
  if (req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => { try { reports.push(JSON.parse(body)); } catch (e) {} res.end("ok"); });
    return;
  }
  res.setHeader("content-type", "text/html");
  res.setHeader("cache-control", "no-store");
  res.end(PAGE);
});

/// Opens the site in the profile `id` as a second launch does (a pinned
/// profile's button: --profile=<id> and the address), and waits for its
/// report.
let visits = 0;
const visit = async (id, tag, mode) => {
  // (Each visit's report is told apart by a mark of its own: the tabs a
  // restart opens again load and report too.)
  const mark = `v${++visits}-${Date.now()}`;
  const url = `http://127.0.0.1:${site.address().port}/check?tag=${encodeURIComponent(tag)}&mode=${mode}&visit=${mark}`;
  const mine = () => reports.find((r) => r.visit === mark);
  const handed = Date.now();
  const second = spawn(exe, [...launchArgs, `--profile=${id}`, url], { env, stdio: "ignore" });
  const code = await Promise.race([new Promise((resolve) => second.on("exit", resolve)), sleep(20000).then(() => "still running")]);
  const handedMs = Date.now() - handed;
  for (let i = 0; i < 200 && !mine(); i++) await sleep(100);
  return { report: mine() || null, secondLaunch: { code, ms: handedMs } };
};

(async () => {
  await new Promise((resolve) => site.listen(0, "127.0.0.1", resolve));
  const firstStart = !fs.existsSync(path.join(data, "settings.json"));
  report.firstStart = firstStart;

  // 1. The first start (or a start on data already there).
  let app = await start(firstStart ? "first start" : "start");
  if (!app || !app.toolbar) return finish();
  const shown = windowOf(app.child.pid);
  if (shown) step("first start: a window is on the screen", shown.handle !== 0, shown);
  if (WINDOWS && out) {
    // What the screen shows (a machine with no desktop can't be captured:
    // then the window isn't to be seen, whatever the app drew).
    const file = path.join(out, "desktop-first-start.png");
    const ps = `Add-Type -AssemblyName System.Windows.Forms, System.Drawing; $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height; $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); $bmp.Save('${file}'); "$($b.Width)x$($b.Height)"`;
    const shot = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
    // (A limit of the machine, not of Noor: kept apart from the steps.)
    report.desktop = { captured: shot.status === 0 && fs.existsSync(file), said: (shot.stdout + shot.stderr).trim().slice(0, 300), file: path.basename(file) };
    console.error(`note the screen ${report.desktop.captured ? "was captured: " + report.desktop.said : "couldn't be captured: " + report.desktop.said}`);
  }
  let snapshot = await app.invoke("settings:get");
  const firstProfile = snapshot.profiles[0];
  step("first start: a profile to begin with", snapshot.profiles.length >= 1, snapshot.profiles.map((p) => p.name));
  const files = fs.readdirSync(data);
  report.dataFiles = files;
  if (WINDOWS) {
    try {
      const key = JSON.parse(fs.readFileSync(path.join(data, "Local State"), "utf8")).os_crypt.encrypted_key;
      const mark = Buffer.from(key, "base64").subarray(0, 5).toString("latin1");
      step("cookies' key kept by Windows (DPAPI)", mark === "DPAPI", `Local State os_crypt.encrypted_key starts with "${mark}"`);
    } catch (error) {
      step("cookies' key kept by Windows (DPAPI)", false, String(error.message));
    }
    const acl = spawnSync("icacls", [data], { encoding: "utf8" }).stdout || "";
    report.dataFolderAccess = acl.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const everyone = /Everyone|\bUsers\b|Authenticated Users/i.test(acl.split(/\r?\n/).slice(0, -2).join("\n"));
    step("the data folder is the user's alone (icacls)", !everyone, report.dataFolderAccess.slice(0, 6).join(" ; "));
    const listening = (spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" }).stdout || "").split(/\r?\n/).filter((line) => line.includes(`:${app.port} `) && /LISTENING/.test(line)).map((line) => line.trim().split(/\s+/)[1]);
    step("Chromium's debugging port listens on 127.0.0.1 only (netstat)", listening.length > 0 && listening.every((address) => address.startsWith("127.0.0.1:")), listening);
  }

  // 2. A second profile, made as the Settings page's button makes it.
  snapshot = await app.invoke("profiles:create", "Second");
  const second = snapshot.profiles.find((p) => p.name === "Second");
  step("a second profile is made (profiles:create)", Boolean(second), snapshot.profiles.map((p) => p.name));
  if (!second) return finish(app);
  await sleep(1500);

  // 3. What sites keep, in each profile; what pages may do.
  const a = await visit(firstProfile.id, "A", "write");
  step("a page opens in the first profile (--profile=<id>, a second launch)", Boolean(a.report), a.secondLaunch);
  step("the second launch hands its address over and leaves", a.secondLaunch.code === 0 && a.secondLaunch.ms < 15000, a.secondLaunch);
  const b = await visit(second.id, "B", "read");
  step("a page opens in the second profile", Boolean(b.report), b.secondLaunch);
  if (a.report && b.report) {
    step("the first profile keeps what its site wrote", a.report.cookie.includes("noorcheck=A") && a.report.localStorage === "A" && a.report.indexedDB === "A", a.report);
    step("the second profile sees nothing of it (cookies, localStorage, IndexedDB)", !b.report.cookie.includes("noorcheck") && b.report.localStorage === null && b.report.indexedDB === null, { cookie: b.report.cookie, localStorage: b.report.localStorage, indexedDB: b.report.indexedDB });
    const refused = (r) => r.geolocation !== "GRANTED" && r.notificationAsked !== "granted" && r.permissions.camera !== "granted" && r.permissions.microphone !== "granted";
    step("what pages may do is refused in both profiles alike", refused(a.report) && refused(b.report) && JSON.stringify(a.report.permissions) === JSON.stringify(b.report.permissions), { first: { ...a.report.permissions, geolocation: a.report.geolocation, notification: a.report.notificationAsked }, second: { ...b.report.permissions, geolocation: b.report.geolocation, notification: b.report.notificationAsked } });
  }
  if (out) {
    try {
      const { targetInfos } = await app.cdp.send("Target.getTargets");
      const page = targetInfos.find((t) => t.type === "page" && /\/check\?tag=B/.test(t.url));
      if (page) {
        const { sessionId } = await app.cdp.send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
        const shot = await app.cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
        fs.writeFileSync(path.join(out, "built-app-page.png"), Buffer.from(shot.data, "base64"));
        step("the page is drawn (a screenshot of it)", true, "built-app-page.png");
      }
    } catch (error) {
      step("the page is drawn (a screenshot of it)", false, String(error.message));
    }
  }

  // 4. A setting changed as the Settings page changes it.
  snapshot = await app.invoke("settings:set", "cleanLinks", false);
  snapshot = await app.invoke("settings:set", "protection.canvas", false);
  step("settings change (cleanLinks, Canvas protection off)", snapshot.cleanLinks === false && snapshot.protections.canvas === false, { cleanLinks: snapshot.cleanLinks, canvas: snapshot.protections.canvas });

  // 5. Closed, as Windows closes an app, then opened again.
  await close(app, "close");
  app = await start("opened again");
  if (!app || !app.toolbar) return finish();
  snapshot = await app.invoke("settings:get");
  step("the profiles are kept", snapshot.profiles.map((p) => p.id).join() .includes(second.id) && snapshot.profiles.length >= 2, snapshot.profiles.map((p) => p.name));
  step("the settings are kept", snapshot.cleanLinks === false && snapshot.protections.canvas === false, { cleanLinks: snapshot.cleanLinks, canvas: snapshot.protections.canvas });
  const a2 = await visit(firstProfile.id, "A", "read");
  const b2 = await visit(second.id, "B", "read");
  if (a2.report && b2.report) {
    step("after the restart, the first profile still has its site's data", a2.report.cookie.includes("noorcheck=A") && a2.report.localStorage === "A" && a2.report.indexedDB === "A", { cookie: a2.report.cookie, localStorage: a2.report.localStorage, indexedDB: a2.report.indexedDB });
    step("after the restart, the second profile still has none of it", !b2.report.cookie.includes("noorcheck") && b2.report.localStorage === null && b2.report.indexedDB === null, { cookie: b2.report.cookie, localStorage: b2.report.localStorage, indexedDB: b2.report.indexedDB });
  } else {
    step("after the restart, pages open in both profiles", false, { first: Boolean(a2.report), second: Boolean(b2.report) });
  }
  // The settings as they were.
  await app.invoke("settings:set", "cleanLinks", true);
  await app.invoke("settings:set", "protection.canvas", true);
  await close(app, "close again");
  finish();
})().catch((error) => {
  step("the check ran to its end", false, String(error && error.stack || error));
  finish();
});

function finish(app) {
  if (app && app.child) {
    try { app.cdp.close(); } catch (e) {}
    if (WINDOWS) spawnSync("taskkill", ["/F", "/T", "/PID", String(app.child.pid)], { stdio: "ignore" });
    else app.child.kill("SIGKILL");
  }
  site.close();
  if (out) fs.writeFileSync(path.join(out, "built-app.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.problems.length ? 1 : 0);
}
