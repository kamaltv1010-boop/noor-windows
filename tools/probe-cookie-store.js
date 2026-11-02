// Whether what a site keeps in a profile's cookies (a login's token, say)
// can be read off the disk as it is. Electron keeps cookies in plain text
// unless the app is built with its EnableCookieEncryption fuse, as Noor is
// (package.json, build.electronFuses), and then encrypts them as Chrome
// does (on Windows with the user's own key, DPAPI). Noor is started as a
// user starts it (no test tool attached), a page sets a cookie with a
// secret value for an hour, Noor is asked to quit (as Windows asks an app
// when the user signs out), and every file in its data folder is searched
// for the secret.
//   node tools/probe-cookie-store.js [electron]
//     the Electron to run: a built Noor (dist/linux-unpacked/noor-browser,
//     from `npx electron-builder --linux dir`), or node_modules' own (the
//     default, as `npm start` runs it, with no fuse flipped).
//   node tools/probe-cookie-store.js [electron] --after <electron>
//     first a cookie with the first (an older Noor), then a second one with
//     the other, on the same data: the old cookie must still reach its
//     site, and the new one must not be on the disk as it is.
// Exits 1 if a secret is on the disk as it is (the old one's, with
// --after, is only reported: Chromium encrypts a cookie as it is written),
// or the old cookie is lost; 2 if a cookie never got to the disk.
// Needs a display: `xvfb-run -a node tools/probe-cookie-store.js ...` (on
// Windows, `node tools/probe-cookie-store.js dist/win-unpacked/Noor.exe`).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn, spawnSync, execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const args = process.argv.slice(2);
const afterAt = args.indexOf("--after");
const after = afterAt >= 0 ? path.resolve(args[afterAt + 1]) : null;
const firstArg = args.find((arg, i) => arg !== "--after" && args[i - 1] !== "--after");
const first = firstArg ? path.resolve(firstArg) : require(path.join(root, "node_modules", "electron"));

/// A built app has its code beside it (resources/app.asar); Electron alone
/// is given the source folder.
const launchArgs = (exe) => [...(fs.existsSync(path.join(path.dirname(exe), "resources", "app.asar")) ? [] : [root]), "--no-sandbox"];
const PYTHON = process.platform === "win32" ? "python" : "python3";

/// Asks Noor to quit as the system asks an app (Windows: its windows are
/// sent WM_CLOSE, taskkill without /F; elsewhere SIGTERM): Chromium writes
/// what it holds before it goes. (Killed outright, it may not.)
const askToQuit = (child) => {
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid)], { stdio: "ignore" });
  else child.kill("SIGTERM");
};

/// Every file under `dir` (but big ones) that holds `text` as it is.
const filesHolding = (dir, text) => {
  const found = [];
  const needle = Buffer.from(text);
  const walk = (at) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && fs.statSync(full).size < 64 * 1024 * 1024 && fs.readFileSync(full).includes(needle)) found.push(path.relative(dir, full));
    }
  };
  walk(dir);
  return found;
};

/// The rows of each cookie database under `dir` for the cookie `name`: how
/// its value is kept (the plain value's length, and the first bytes of the
/// encrypted one: "v10" or "v11" as Chromium marks what it encrypted).
const rowsOf = (dir, name) => {
  const rows = [];
  const walk = (at) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "Cookies") {
        const out = execFileSync(PYTHON, ["-I", "-c", [
          "import sqlite3, sys, json",
          "db = sqlite3.connect(sys.argv[1])",
          "rows = db.execute('select host_key, length(value), substr(encrypted_value, 1, 3), length(encrypted_value) from cookies where name = ?', (sys.argv[2],)).fetchall()",
          "print(json.dumps([[r[0], r[1], (r[2] or b'').decode('latin-1'), r[3]] for r in rows]))",
        ].join("\n"), full, name], { encoding: "utf8" });
        for (const [host, plain, mark, encrypted] of JSON.parse(out)) rows.push({ file: path.relative(dir, full), host, plainLength: plain, encryptedMark: mark, encryptedLength: encrypted });
      }
    }
  };
  walk(dir);
  return rows;
};

/// Starts the Electron `exe` on `userData` as a user starts Noor, opens the
/// page that sets the cookie `name` (its secret: `secret`), asks Noor to
/// quit, and gives back the Cookie header the page's visit brought and
/// whether the cookie came back from the browser before it quit.
const visit = async (exe, userData, name, secret) => {
  const seen = { visit: null, back: null };
  // When each request came, in ms from the second start (the one given the
  // page), for the log: a page that never asks back is told apart from one
  // that asks late.
  let givenAt = Date.now();
  const times = {};
  const web = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    res.setHeader("cache-control", "no-store");
    if (url.pathname === "/set") {
      seen.visit = req.headers.cookie || "";
      times.visit = Date.now() - givenAt;
      res.setHeader("set-cookie", `${name}=${secret}; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax`);
      res.setHeader("content-type", "text/html");
      res.end("<!doctype html><title>cookie</title><p>cookie</p><script>fetch('/back')</script>");
    } else if (url.pathname === "/back") {
      seen.back = req.headers.cookie || "";
      times.back = Date.now() - givenAt;
      res.end("ok");
    } else {
      res.end("");
    }
  });
  await new Promise((resolve) => web.listen(0, "127.0.0.1", resolve));
  const env = { ...process.env, NOOR_USER_DATA: userData, NOOR_TEST_OPEN_WINDOWS: "1" };
  delete env.NOOR_TEST;
  // (A built Noor iPhone or Noor Android is what it was built as; Electron
  // alone runs Noor's source as Noor.)
  if (launchArgs(exe).includes(root)) env.NOOR_DEVICE = "windows";
  else delete env.NOOR_DEVICE;
  const app = spawn(exe, launchArgs(exe), { env, stdio: "ignore" });
  const exited = new Promise((resolve) => app.on("exit", (code, signal) => resolve(signal || code)));
  await sleep(7000);
  givenAt = Date.now();
  const second = spawn(exe, [...launchArgs(exe), `http://127.0.0.1:${web.address().port}/set`], { env, stdio: "ignore" });
  await new Promise((resolve) => second.on("exit", resolve));
  const until = Date.now() + 60000;
  while (seen.back === null && Date.now() < until) await sleep(250);
  askToQuit(app);
  const how = await Promise.race([exited, sleep(30000).then(() => "still running")]);
  if (how === "still running") app.kill("SIGKILL");
  await sleep(1000);
  web.close();
  return { ...seen, quit: how, times };
};

(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-cookies-"));
  const result = { first, after };
  const problems = [];
  const secrets = { old: "noor-old-" + crypto.randomBytes(12).toString("hex"), new: "noor-new-" + crypto.randomBytes(12).toString("hex") };
  const runs = after ? [["old_token", secrets.old, first], ["new_token", secrets.new, after]] : [["new_token", secrets.new, first]];
  for (const [name, secret, exe] of runs) {
    const seen = await visit(exe, userData, name, secret);
    result[name] = { electron: exe, ...seen, rows: rowsOf(userData, name), plainIn: filesHolding(userData, secret) };
    if (!seen.back || !seen.back.includes(`${name}=${secret}`)) problems.push(`${name}: the browser never sent the cookie back (${seen.back})`);
  }
  if (after) {
    const visit2 = result.new_token.visit || "";
    result.oldCookieReachedItsSite = visit2.includes(`old_token=${secrets.old}`);
    if (!result.oldCookieReachedItsSite) problems.push(`the cookie set before (by ${first}) was lost: the site got "${visit2}"`);
    result.oldRows = rowsOf(userData, "old_token");
    result.oldPlainIn = filesHolding(userData, secrets.old);
  }
  const last = result.new_token;
  if (!last.rows.length) {
    result.problems = [...problems, "the cookie never got to the disk"];
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }
  if (last.plainIn.length) problems.push(`the secret is on the disk as it is, in ${last.plainIn.join(", ")}`);
  result.problems = problems;
  console.log(JSON.stringify(result, null, 2));
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
