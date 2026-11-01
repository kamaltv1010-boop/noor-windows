// Closes Noor with two windows open (two profiles, a page in each) as
// Windows closes them, and checks that it quits: each window's "close" and
// "closed", then the app's "window-all-closed", "before-quit", "will-quit"
// and "quit", its process gone in a few seconds, and none of its processes
// left. Three ways:
//   one-by-one  a request to each window, the next once the first is gone
//               (a user closing one window, then the other);
//   at-once     a request to both windows at the same moment (Windows'
//               taskbar "Close all windows");
//   taskkill    `taskkill /PID <pid>` without /F (Windows only), which asks
//               every window of the process to close.
// On Windows a request is what Windows sends a window: WM_CLOSE posted to
// it (PostMessage); elsewhere BaseWindow.close(). Every event is written to
// a file as it happens, with its time, so what happened is known even when
// Noor doesn't quit; on Windows, every window of the process (shown or not,
// with its class) is listed before and, if it is still running, after.
// Needs Playwright and a display: on Linux,
// `xvfb-run -a node tools/smoke-close.js [one-by-one|at-once|taskkill]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawnSync } = require("child_process");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const onWindows = process.platform === "win32";
const asked = process.argv[2];
const modes = asked ? [asked] : ["one-by-one", "at-once"].concat(onWindows ? ["taskkill"] : []);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const powershell = (script) => {
  const done = spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 60000 });
  return ((done.stdout || "") + (done.stderr ? "\n" + done.stderr : "")).trim();
};

/// WM_CLOSE posted to each of `handles`, one right after the other.
const postClose = (handles) => powershell(`Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class NoorPost {
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
}
"@
${handles.map((h) => `"${h} " + [NoorPost]::PostMessage([IntPtr]${h}, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)`).join("\n")}`);

/// Every top-level window of the process `pid`: "handle shown|hidden class title".
const windowsOf = (pid) => powershell(`Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class NoorAll {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  public static string List(uint want) {
    var found = new List<string>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == want) { var t = new StringBuilder(256); GetWindowText(h, t, 256); var c = new StringBuilder(256); GetClassName(h, c, 256); found.Add(h.ToInt64() + " " + (IsWindowVisible(h) ? "shown" : "hidden") + " " + c + " " + t); } return true; }, IntPtr.Zero);
    return string.Join("\\n", found);
  }
}
"@
[NoorAll]::List(${pid})`).split(/\\n|\r?\n/).filter(Boolean);

/// The processes Noor started that are still running: on Windows its
/// children (they keep their parent's id), elsewhere those with its data
/// folder in their environment.
const leftOf = (pid, userData) => {
  if (onWindows) {
    return powershell(`Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid} OR ProcessId=${pid}" | ForEach-Object { "$($_.ProcessId) $($_.Name)" }`).split(/\r?\n/).filter(Boolean);
  }
  const left = [];
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      if (fs.readFileSync(`/proc/${entry}/environ`, "latin1").includes(`NOOR_USER_DATA=${userData}\0`)) left.push(entry);
    } catch (error) {
      // Gone, or not ours.
    }
  }
  return left;
};

const run = async (mode, base) => {
  const report = { mode };
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-close-"));
  const eventsFile = path.join(userData, "close-events.log");
  const env = { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: userData, NOOR_DEVICE: process.env.NOOR_DEVICE || "windows" };
  const electronPath = require(path.join(root, "node_modules", "electron"));
  const app = await electron.launch({ executablePath: electronPath, args: [root, "--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1"], env });
  app.process().stderr.on("data", (data) => { if (process.env.SMOKE_VERBOSE) process.stderr.write("[electron] " + data); });
  const exited = new Promise((resolve) => app.process().once("exit", (code, signal) => resolve({ code, signal })));
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  // Noor's own process, the one its windows are in: on Windows Playwright
  // starts Electron through a shell (cmd.exe), whose process is the one it
  // hands over, with no window of its own.
  const pid = await main(() => process.pid);
  report.pid = { noor: pid, started: app.process().pid };
  // A second profile in a window of its own, and a page in each window.
  report.opened = await main(async (electron, base) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const w = global.noorTest.windows;
    const home = w.current;
    const tab = home.newTab({ url: "noor://app/settings.html" });
    await wait(1500);
    await tab.webContents.executeJavaScript('noor.invoke("profiles:create", "Second")');
    for (let i = 0; i < 100 && w.list.length < 2; i++) await wait(50);
    const second = w.current;
    await second.dressing;
    for (let i = 0; i < 100 && !second.win.isVisible(); i++) await wait(50);
    home.close(tab);
    for (const b of w.list) {
      b.selected.webContents.loadURL(`${base}/${encodeURIComponent(b.profile.name)}`);
    }
    await wait(1500);
    return w.list.map((b) => ({ profile: b.profile.name, title: b.win.getTitle(), shown: b.win.isVisible(), url: b.selected.webContents.getURL() }));
  }, base);
  // Every event, as it happens, in a file.
  const order = await main((electron, file) => {
    const fs = process.mainModule.require("fs");
    const note = (what) => {
      try {
        fs.appendFileSync(file, `${global.closeAsked ? Date.now() - global.closeAsked : "-"} ${what}\n`);
      } catch (error) {
        // Nowhere to write.
      }
    };
    global.noteClose = note;
    const list = global.noorTest.windows.list.slice();
    for (const b of list) {
      const name = b.profile.name;
      b.win.on("close", () => note(`close ${name}`));
      b.win.on("closed", () => note(`closed ${name}`));
    }
    for (const event of ["window-all-closed", "before-quit", "will-quit", "quit"]) {
      electron.app.on(event, () => note(event));
    }
    process.on("exit", () => note("exit"));
    return list.map((b) => {
      const handle = b.win.getNativeWindowHandle();
      return { profile: b.profile.name, handle: handle.length >= 8 ? handle.readBigUInt64LE(0).toString() : String(handle.readUInt32LE(0)) };
    });
  }, eventsFile);
  report.windows = order;
  if (onWindows) {
    report.before = windowsOf(pid);
  }
  const ask = (label) => main((electron, label) => {
    global.closeAsked = global.closeAsked || Date.now();
    global.noteClose(`asked: ${label}`);
  }, label).catch(() => {});
  const closeOne = async (entry) => {
    await ask(entry.profile);
    if (onWindows) {
      return postClose([entry.handle]);
    }
    return main((electron, name) => {
      const b = global.noorTest.windows.list.find((x) => x.profile.name === name);
      b.win.close();
      return `close() ${name}`;
    }, entry.profile).catch((error) => `close() ${entry.profile}: ${String(error).split("\n")[0]}`);
  };
  const events = () => (fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, "utf8").trim().split(/\r?\n/) : []);
  // The one in front first (the second profile's), then the first profile's.
  const front = order.slice().reverse();
  report.requests = [];
  let lastAsked = Date.now();
  if (mode === "one-by-one") {
    for (const entry of front) {
      lastAsked = Date.now();
      report.requests.push(await closeOne(entry));
      for (let i = 0; i < 100 && !events().some((line) => line.endsWith(` closed ${entry.profile}`)); i++) await sleep(50);
    }
  } else if (mode === "at-once") {
    await ask("all");
    lastAsked = Date.now();
    report.requests.push(onWindows
      ? postClose(front.map((entry) => entry.handle))
      : await main(() => {
        for (const b of global.noorTest.windows.list.slice().reverse()) b.win.close();
        return "close() all";
      }).catch((error) => `close() all: ${String(error).split("\n")[0]}`));
  } else if (mode === "taskkill") {
    await ask("taskkill");
    lastAsked = Date.now();
    const done = spawnSync("taskkill", ["/PID", String(pid)], { encoding: "utf8" });
    report.requests.push(((done.stdout || "") + (done.stderr || "")).trim());
  } else {
    throw new Error(`no such way to close: ${mode}`);
  }
  const quit = await Promise.race([exited, sleep(20000).then(() => null)]);
  report.quitMs = quit ? Date.now() - lastAsked : null;
  report.exit = quit;
  if (!quit) {
    // Still running: what is left of it.
    report.stillOpen = await main((electron) => ({
      windows: electron.BaseWindow.getAllWindows().map((w) => ({ id: w.id, title: w.getTitle(), shown: w.isVisible(), destroyed: w.isDestroyed() })),
      noor: global.noorTest.windows.list.map((b) => ({ profile: b.profile.name, closing: Boolean(b.closing), closed: Boolean(b.closed) })),
      quitting: global.noorTest.windows.quitting,
    })).catch((error) => String(error).split("\n")[0]);
    if (onWindows) {
      report.after = windowsOf(pid);
    }
  }
  report.events = events();
  if (!quit) {
    await app.close().catch(() => {});
    try {
      process.kill(pid);
    } catch (error) {
      // Gone.
    }
  }
  await sleep(3000);
  report.processesLeft = leftOf(pid, userData);
  const names = order.map((entry) => entry.profile);
  const line = (text) => report.events.findIndex((l) => l.endsWith(` ${text}`));
  report.checks = {
    quits: Boolean(quit) && report.quitMs < 15000,
    eachWindowClosed: names.every((name) => line(`closed ${name}`) >= 0),
    appQuitAfterTheWindows: line("will-quit") > Math.max(...names.map((name) => line(`closed ${name}`))),
    noProcessLeft: report.processesLeft.length === 0,
  };
  report.ok = Object.values(report.checks).every(Boolean);
  if (!quit) {
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      // Gone.
    }
  }
  return report;
};

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><title>Page ${req.url}</title><p>${req.url}</p>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://close.test:${server.address().port}`;
  const reports = [];
  for (const mode of modes) {
    reports.push(await run(mode, base));
  }
  server.close();
  console.log(JSON.stringify(reports, null, 1));
  // Each way in one line, last (a CI log shows the last lines of a check).
  for (const r of reports) {
    const parts = [
      r.ok ? "ok" : "FAILED",
      `quit ${r.quitMs === null ? "no" : `in ${r.quitMs} ms`}`,
      `pid ${JSON.stringify(r.pid)}`,
      `requests ${JSON.stringify(r.requests)}`,
      `windows before ${JSON.stringify(r.before || [])}`,
      `events ${JSON.stringify(r.events)}`,
      `processes left ${JSON.stringify(r.processesLeft)}`,
    ];
    if (r.stillOpen) parts.push(`still open ${JSON.stringify(r.stillOpen)}`);
    if (r.after) parts.push(`windows after ${JSON.stringify(r.after)}`);
    console.log(`MODE ${r.mode}: ${parts.join("; ")}`);
  }
  const failed = reports.filter((r) => !r.ok).map((r) => `${r.mode} (${Object.keys(r.checks).filter((k) => !r.checks[k]).join(", ")})`);
  console.log(failed.length ? `CLOSE SMOKE FAILED: ${failed.join("; ")}` : "CLOSE SMOKE OK");
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
