// Whether a file a site downloads carries Windows' Mark of the Web (the
// Zone.Identifier stream beside it, ZoneId=3: from the internet), as
// Chrome's downloads do. Without it a program runs with no SmartScreen
// check and an Office document opens with its macros, not in Protected
// View, as if it were one of this computer's own. Chromium in Electron
// writes it itself (seen on Windows, CI run 41512893358: ZoneId=3 with the
// page's and the file's addresses, and about:internet from a private
// tab); this check keeps it so.
// A site's page has a link to a document (Content-Disposition:
// attachment); the user's click (a real one) downloads it to where the
// Save dialog would put it (set here, as the user's choice). From a tab,
// then from a private tab (Chrome writes no addresses there).
// Prints what each file carries; on Windows, exits 1 if a download has no
// mark, or a wrong one. Elsewhere there is no such stream: it says so and
// checks nothing.
// Needs Playwright and a display: `xvfb-run -a node tools/probe-downloads.js`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const WINDOWS = process.platform === "win32";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BIG = "display:block;width:320px;height:120px;font-size:30px";

(async () => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/report.docm") {
      res.setHeader("content-type", "application/vnd.ms-word.document.macroEnabled.12");
      res.setHeader("content-disposition", 'attachment; filename="report.docm"');
      return res.end("not a real document: a test of Noor's downloads");
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><title>a site</title><a id="b" href="/report.docm" style="${BIG}">download</a>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const page = `http://files.test:${server.address().port}/page`;

  const download = async (label, extraEnv, isPrivate) => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-downloads-"));
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "noor-saved-"));
    const env = { ...process.env, NOOR_TEST: "1", NOOR_TEST_TIMEZONE: "Africa/Casablanca", NOOR_USER_DATA: userData, NOOR_DEVICE: "windows", ...extraEnv };
    const app = await electron.launch({ executablePath: require(path.join(root, "node_modules", "electron")), args: [root, "--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1"], env });
    for (let i = 0; i < 200; i++) {
      if (await app.evaluate(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
      await sleep(100);
    }
    await sleep(1000);
    const result = await app.evaluate(async (electron, [url, where, privately]) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const browser = global.noorTest.browser;
      const tab = browser.newTab(privately ? { isPrivate: true } : { url });
      if (privately) {
        await wait(400);
        tab.load(url);
      }
      // Where the user chose in the Save dialog.
      const done = new Promise((resolve) => {
        tab.webContents.session.once("will-download", (event, item) => {
          item.setSavePath(where + (process.platform === "win32" ? "\\" : "/") + item.getFilename());
          item.once("done", (e, state) => setTimeout(() => resolve({ state, file: item.getSavePath() }), 1500));
        });
        setTimeout(() => resolve({ state: "no download in 20 s" }), 20000);
      });
      await wait(2000);
      const rect = await tab.webContents.executeJavaScript("(() => { const r = document.getElementById('b').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()");
      tab.webContents.focus();
      for (const type of ["mouseDown", "mouseUp"]) {
        tab.webContents.sendInputEvent({ type, x: rect.x, y: rect.y, button: "left", clickCount: 1 });
        await wait(60);
      }
      return done;
    }, [page, folder, Boolean(isPrivate)]).catch((error) => ({ state: "error " + String(error).split("\n")[0] }));
    await app.close().catch(() => {});
    let mark = null;
    if (result.file && WINDOWS) {
      try {
        mark = fs.readFileSync(`${result.file}:Zone.Identifier`, "utf8");
      } catch (error) {
        mark = null;
      }
    }
    return { label, state: result.state, file: result.file ? path.basename(result.file) : null, mark };
  };

  const runs = [
    await download("Noor", {}),
    await download("Noor, a private tab", {}, true),
  ];
  server.close();

  const problems = [];
  for (const run of runs) {
    // ("note …": shown in the checks' report too.)
    console.log(`note ${run.label}: ${run.state}${run.file ? " (" + run.file + ")" : ""}; mark: ${run.mark === null ? (WINDOWS ? "NONE" : "(no such stream here)") : JSON.stringify(run.mark)}`);
    if (run.state !== "completed") problems.push(`${run.label}: the download didn't complete (${run.state})`);
  }
  if (WINDOWS) {
    const [noor, privateTab] = runs;
    if (!noor.mark || !/^ZoneId=3\r?$/m.test(noor.mark)) problems.push("Noor's download has no Mark of the Web (ZoneId=3)");
    else if (!/^HostUrl=http:\/\/files\.test:\d+\/report\.docm\r?$/m.test(noor.mark) || !/^ReferrerUrl=http:\/\/files\.test:\d+\/page\r?$/m.test(noor.mark)) problems.push(`Noor's mark names the wrong places: ${JSON.stringify(noor.mark)}`);
    if (!privateTab.mark || !/^ZoneId=3\r?$/m.test(privateTab.mark)) problems.push("a private tab's download has no Mark of the Web");
    else if (/files\.test/.test(privateTab.mark)) problems.push(`a private tab's mark names where it came from: ${JSON.stringify(privateTab.mark)}`);
  } else {
    console.log("NOTE: not Windows: there is no Zone.Identifier stream to check here");
  }
  console.log(problems.length ? `DOWNLOADS: ${problems.join(" | ")}` : WINDOWS ? "DOWNLOADS: every download of Noor's is marked as from the internet" : "DOWNLOADS: the downloads completed; their mark is Windows' alone, not checked here");
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
