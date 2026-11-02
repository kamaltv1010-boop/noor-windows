// Whether a website can start a program of the computer through a link
// of another scheme: on Windows ms-msdt:, search-ms:, ms-settings: and the
// like each start a program, and Electron hands a link whose scheme it
// doesn't know to the system when the app allows it (the "openExternal"
// permission), with no question to the user.
// A scheme only this check knows is set up for the computer's user (on
// Windows under HKCU\Software\Classes, as an app registers its links; on
// Linux an xdg-open of the check's own, first in PATH), whose program only
// writes down that it was started, and with what. A site then tries it
// every way: going to it by itself, a link the user clicks (a real click,
// through Chromium's input), a window opened by the user's click, a frame.
// Then, as the control, a link clicked with the app allowing it: the
// program must start then, or the check proves nothing.
// Prints what each try did; exits 1 if a site started the program, 2 if
// the control didn't (the check can't tell). Needs Playwright and a display.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawnSync } = require("child_process");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const onWindows = process.platform === "win32";
const SCHEME = "noor-test-proto";
const work = fs.mkdtempSync(path.join(os.tmpdir(), "noor-protocols-"));
const log = path.join(work, "started.log");
const started = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean) : []);

/// The program the scheme starts: it writes down the link it was given.
const program = path.join(work, "started.js");
fs.writeFileSync(program, `require("fs").appendFileSync(${JSON.stringify(log)}, String(process.argv.slice(2).join(" ")) + "\\n");\n`);

const KEY = `HKCU:\\Software\\Classes\\${SCHEME}`;
const setUp = () => {
  if (onWindows) {
    const command = `"${process.execPath}" "${program}" "%1"`;
    const ps = [
      `New-Item -Path '${KEY}\\shell\\open\\command' -Force | Out-Null`,
      `Set-Item -Path '${KEY}' -Value 'URL:Noor check'`,
      `New-ItemProperty -Path '${KEY}' -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null`,
      `Set-Item -Path '${KEY}\\shell\\open\\command' -Value '${command.replace(/'/g, "''")}'`,
      `(Get-Item -Path '${KEY}\\shell\\open\\command').GetValue('')`,
    ].join("; ");
    return (spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).stdout || "").trim();
  }
  const bin = path.join(work, "bin");
  fs.mkdirSync(bin);
  const opener = path.join(bin, "xdg-open");
  fs.writeFileSync(opener, `#!/bin/sh\nexec "${process.execPath}" "${program}" "$@"\n`);
  fs.chmodSync(opener, 0o755);
  return opener;
};
const takeDown = () => {
  if (onWindows) {
    spawnSync("powershell", ["-NoProfile", "-Command", `Remove-Item -Path '${KEY}' -Recurse -Force -ErrorAction SilentlyContinue`]);
  }
};

const BIG = "display:block;width:300px;height:120px;font-size:30px";
const PAGES = {
  // By itself, no click.
  navigate: `<script>setTimeout(() => { location.href = "${SCHEME}:navigate"; }, 300);</script>`,
  frame: `<iframe src="${SCHEME}:frame"></iframe>`,
  // With the user's click.
  link: `<a id="b" href="${SCHEME}:link" style="${BIG}">open</a>`,
  window: `<button id="b" style="${BIG}" onclick="window.open('${SCHEME}:window')">open</button>`,
  // The control: a link clicked, the app allowing it this once.
  control: `<a id="b" href="${SCHEME}:control" style="${BIG}">open</a>`,
};
const CLICKED = new Set(["link", "window", "control"]);

(async () => {
  const report = { system: `${os.type()} ${os.release()}`, scheme: SCHEME, setUp: setUp() };
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, "http://x").pathname.slice(1);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><title>${name}</title><p>a site</p>${PAGES[name] || ""}`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://evil.test:${server.address().port}`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-protocols-data-"));
  const env = { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: userData, NOOR_DEVICE: process.env.NOOR_DEVICE || "windows" };
  if (!onWindows) {
    env.PATH = `${path.join(work, "bin")}${path.delimiter}${env.PATH || ""}`;
  }
  const electronPath = require(path.join(root, "node_modules", "electron"));
  const app = await electron.launch({ executablePath: electronPath, args: [root, "--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1"], env });
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  await sleep(1000);

  report.tries = {};
  try {
    for (const name of Object.keys(PAGES)) {
      const before = started().length;
      report.tries[name] = await main(async (electron, [url, click, allow]) => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const browser = global.noorTest.browser;
        const tab = browser.newTab({ url });
        await wait(1500);
        if (allow) {
          // The control: this tab's session allows what the app refuses.
          tab.webContents.session.setPermissionRequestHandler((wc, permission, callback) => callback(true));
        }
        if (click) {
          const rect = await tab.webContents.executeJavaScript("(() => { const r = document.getElementById('b').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()");
          tab.webContents.focus();
          for (const type of ["mouseDown", "mouseUp"]) {
            tab.webContents.sendInputEvent({ type, x: rect.x, y: rect.y, button: "left", clickCount: 1 });
            await wait(60);
          }
        }
        await wait(2500);
        const result = { tabURL: tab.webContents.isDestroyed() ? "closed" : tab.webContents.getURL() };
        browser.close(tab);
        return result;
      }, [`${base}/${name}`, CLICKED.has(name), name === "control"]);
      await sleep(1500);
      report.tries[name].programStarted = started().slice(before);
    }
  } finally {
    await app.close().catch(() => {});
    server.close();
    takeDown();
  }

  console.log(JSON.stringify(report, null, 1));
  const siteStarted = Object.entries(report.tries).filter(([name, t]) => name !== "control" && t.programStarted.length).map(([name]) => name);
  const controlStarted = report.tries.control && report.tries.control.programStarted.length > 0;
  for (const [name, t] of Object.entries(report.tries)) {
    console.log(`TRY ${name}: ${t.programStarted.length ? "THE PROGRAM STARTED: " + JSON.stringify(t.programStarted) : "the program didn't start"}`);
  }
  if (siteStarted.length) {
    console.log(`EXTERNAL PROTOCOLS: A SITE STARTED A PROGRAM (${siteStarted.join(", ")})`);
    process.exit(1);
  }
  if (!controlStarted) {
    console.log("EXTERNAL PROTOCOLS: the control didn't start the program either: this check can't tell here");
    process.exit(2);
  }
  console.log("EXTERNAL PROTOCOLS: no site started a program (the control did)");
  process.exit(0);
})().catch((error) => {
  takeDown();
  console.error(error);
  process.exit(1);
});
