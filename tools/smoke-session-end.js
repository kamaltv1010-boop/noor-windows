// What a Windows shutdown, restart or sign-out keeps of Noor. Windows asks
// each window whether the session may end (WM_QUERYENDSESSION), tells it
// that it ends (WM_ENDSESSION), then ends the process; Electron emits no
// "before-quit" then (its documentation says so), so what Noor saves as it
// quits isn't saved. The pages open as the session ends must open again at
// the next start, as they were: a page reached from a link in a tab, not
// only a tab opened or chosen; and its settings file must still read.
// On Windows the two messages go to each of Noor's windows as Windows sends
// them (SendMessageTimeout, every window asked first, then every window
// told); elsewhere each window is told "session-end", as Electron tells it
// on Windows. Then the process is ended at once (as Windows does), and Noor
// started again on the same data.
// Needs Playwright and a display: on Linux,
// `xvfb-run -a node tools/smoke-session-end.js`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawnSync } = require("child_process");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const onWindows = process.platform === "win32";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/// What Windows sends as the session ends, to each of `handles`: first
/// every window asked, then every window told (a sign-out: ENDSESSION_LOGOFF).
const endSession = (handles) => {
  const ps = `Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class NoorSession {
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint flags, uint ms, out IntPtr result);
}
"@
$r = [IntPtr]::Zero
${handles.map((h) => `"${h} asked: " + [NoorSession]::SendMessageTimeout([IntPtr]${h}, 0x0011, [IntPtr]::Zero, [IntPtr]0x80000000, 2, 5000, [ref]$r) + " answered " + $r`).join("\n")}
${handles.map((h) => `"${h} told: " + [NoorSession]::SendMessageTimeout([IntPtr]${h}, 0x0016, [IntPtr]1, [IntPtr]0x80000000, 2, 5000, [ref]$r)`).join("\n")}`;
  const done = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8", timeout: 60000 });
  return ((done.stdout || "") + (done.stderr ? "\n" + done.stderr : "")).trim().split(/\r?\n/).filter(Boolean);
};

const launch = async (userData, report, label) => {
  const env = { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: userData, NOOR_DEVICE: process.env.NOOR_DEVICE || "windows" };
  const electronPath = require(path.join(root, "node_modules", "electron"));
  const app = await electron.launch({ executablePath: electronPath, args: [root, "--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1"], env });
  app.process().stderr.on("data", (data) => { if (process.env.SMOKE_VERBOSE) process.stderr.write(`[${label}] ` + data); });
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  await sleep(1000);
  // Noor's own process (on Windows Playwright starts it through cmd.exe).
  const pid = await main(() => process.pid);
  return { app, main, pid };
};

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><title>Page ${req.url}</title><p>${req.url}</p>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://session.test:${server.address().port}`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-session-"));
  const report = { system: `${os.type()} ${os.release()}` };

  // 1. Two tabs; in each, a page reached from the page before (as a link
  // does), after the tab was opened.
  let { app, main, pid } = await launch(userData, report, "first");
  report.before = await main(async (electron, base) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const browser = global.noorTest.windows.current;
    const first = browser.selected;
    await first.webContents.loadURL(`${base}/a`);
    await wait(500);
    first.webContents.executeJavaScript(`location.href = ${JSON.stringify(`${base}/b`)}`);
    const second = browser.newTab({ url: `${base}/c` });
    for (let i = 0; i < 100 && !second.url.endsWith("/c"); i++) await wait(50);
    await wait(500);
    second.webContents.executeJavaScript(`location.href = ${JSON.stringify(`${base}/d`)}`);
    for (let i = 0; i < 100 && !(first.url.endsWith("/b") && second.url.endsWith("/d")); i++) await wait(50);
    await wait(1500);
    return browser.tabs.map((t) => t.url);
  }, base);
  // Then one more page in the first tab, right as the session ends: with
  // the save a second after a page changed held back, only what Noor does
  // as the session ends ("session-end") can keep it.
  report.lastPage = await main(async (electron, base) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const browser = global.noorTest.windows.current;
    browser.saveTabsSoon = () => {};
    const first = browser.tabs[0];
    first.webContents.executeJavaScript(`location.href = ${JSON.stringify(`${base}/e`)}`);
    for (let i = 0; i < 100 && !first.url.endsWith("/e"); i++) await wait(50);
    return browser.tabs.map((t) => t.url);
  }, base);

  // 2. The session ends, as Windows ends it.
  if (onWindows) {
    const handles = await main(() => global.noorTest.windows.list.map((b) => {
      const handle = b.win.getNativeWindowHandle();
      return handle.length >= 8 ? handle.readBigUInt64LE(0).toString() : String(handle.readUInt32LE(0));
    }));
    report.messages = endSession(handles);
  } else {
    report.messages = await main(() => global.noorTest.windows.list.map((b) => {
      b.win.emit("session-end", { reasons: ["logoff"] });
      return `${b.profile.name}: session-end`;
    }));
  }
  if (onWindows) {
    spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      // Gone.
    }
  }
  await app.close().catch(() => {});
  await sleep(3000);

  // 3. Its settings file still reads, and the next start opens the pages
  // as they were.
  const file = path.join(userData, "settings.json");
  try {
    JSON.parse(fs.readFileSync(file, "utf8"));
    report.settingsRead = true;
  } catch (error) {
    report.settingsRead = String(error).split("\n")[0];
  }
  ({ app, main, pid } = await launch(userData, report, "again"));
  report.after = await main(() => global.noorTest.windows.current.tabs.map((t) => t.deferredURL || t.url));
  await app.close().catch(() => {});
  server.close();

  const has = (page) => report.after.some((url) => url.endsWith(page));
  const checks = {
    // /d: reached a while before the end (saved a second after it).
    pageReachedBeforeKept: has("/d") && !has("/c"),
    // /e: reached right as the session ended (saved as it ended).
    pageReachedAsItEndedKept: has("/e") && !has("/a") && !has("/b"),
    settingsRead: report.settingsRead === true,
  };
  report.checks = checks;
  console.log(JSON.stringify(report, null, 1));
  const failed = Object.keys(checks).filter((name) => !checks[name]);
  console.log(`SESSION-END: before ${JSON.stringify(report.before)}; last page ${JSON.stringify(report.lastPage)}; messages ${JSON.stringify(report.messages)}; after ${JSON.stringify(report.after)}`);
  console.log(failed.length ? `SESSION-END SMOKE FAILED: ${failed.join(", ")}` : "SESSION-END SMOKE OK");
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
