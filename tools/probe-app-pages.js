// Whether a website can reach Noor's own pages (noor://app/…: the settings,
// the start page, the cookies, the library). Those pages are given
// window.noor, the app's calls (settings, profiles, cookies, extensions),
// which the app takes from them alone; Chrome lets no site load its
// chrome:// pages, in a frame or otherwise. A site served here tries: a
// frame of noor://app/settings.html (one the user could be tricked into
// clicking, unseen, over the site's own buttons), going to it, opening it
// in a new window, a link to it clicked, and reading it with fetch. Each is
// then checked from the app itself: the frames of the tab and their
// addresses, the tab's address, the tabs open; and, for any page of Noor's
// a site got, whether it has window.noor and whether the app answers it.
// Prints what each try did; exits 1 if a site reached a page of Noor's.
// Needs Playwright and a display: `xvfb-run -a node tools/probe-app-pages.js`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TARGET = "noor://app/settings.html";

const BIG = "display:block;width:300px;height:120px;font-size:30px";
const PAGES = {
  frame: `<iframe id="f" src="${TARGET}" style="width:600px;height:400px"></iframe>`,
  navigate: `<script>setTimeout(() => { location.href = ${JSON.stringify(TARGET)}; }, 300);</script>`,
  open: `<script>setTimeout(() => { const w = window.open(${JSON.stringify(TARGET)}); fetch("/report?try=open&got=" + (w ? "a window" : "null")); }, 300);</script>`,
  link: `<a id="a" href="${TARGET}">settings</a><script>setTimeout(() => document.getElementById("a").click(), 300);</script>`,
  fetch: `<script>fetch(${JSON.stringify(TARGET)}).then((r) => r.text()).then((t) => fetch("/report?try=fetch&got=" + encodeURIComponent("READ " + t.length + " characters")), (e) => fetch("/report?try=fetch&got=" + encodeURIComponent("blocked: " + e.message)));</script>`,
  // With the user's own click (a real one, through Chromium's input): a
  // window opened then, a link opened in a new tab (Ctrl+click, the middle
  // button), as a site may get a user to do.
  clickopen: `<button id="b" style="${BIG}" onclick="window.open(${JSON.stringify(TARGET).replace(/"/g, "&quot;")})">open</button>`,
  ctrlclick: `<a id="b" href="${TARGET}" style="${BIG}">settings</a>`,
  middleclick: `<a id="b" href="${TARGET}" style="${BIG}">settings</a>`,
  // The site's server sends the tab on to Noor's page (a redirect).
  redirect: `<script>setTimeout(() => { location.href = "/go"; }, 300);</script>`,
};
/// The user's click each of those takes: where (the element), how.
const CLICKS = {
  clickopen: { button: "left", modifiers: [] },
  ctrlclick: { button: "left", modifiers: ["control"] },
  middleclick: { button: "middle", modifiers: [] },
};

(async () => {
  const reports = {};
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/report") {
      reports[url.searchParams.get("try")] = url.searchParams.get("got");
      res.end("ok");
      return;
    }
    if (url.pathname === "/go") {
      res.writeHead(302, { location: TARGET });
      res.end();
      return;
    }
    const name = url.pathname.slice(1);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><title>${name}</title><p>a site</p>${PAGES[name] || ""}`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://evil.test:${server.address().port}`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-apppages-"));
  const env = { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: userData, NOOR_DEVICE: process.env.NOOR_DEVICE || "windows" };
  const electronPath = require(path.join(root, "node_modules", "electron"));
  const app = await electron.launch({ executablePath: electronPath, args: [root, "--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1"], env });
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  await sleep(1000);

  const results = {};
  for (const name of Object.keys(PAGES)) {
    results[name] = await main(async (electron, [url, target, click]) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const browser = global.noorTest.browser;
      const before = new Set(browser.tabs.map((t) => t.id));
      const tab = browser.newTab({ url });
      await wait(click ? 1500 : 3000);
      if (click) {
        // The user's click, as Chromium gets it from the mouse.
        const rect = await tab.webContents.executeJavaScript("(() => { const r = document.getElementById('b').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()");
        tab.webContents.focus();
        for (const type of ["mouseDown", "mouseUp"]) {
          tab.webContents.sendInputEvent({ type, x: rect.x, y: rect.y, button: click.button, clickCount: 1, modifiers: click.modifiers });
          await wait(60);
        }
        await wait(2500);
      }
      const reached = [];
      // Every frame of every tab of the window now: one of Noor's pages a
      // site put there (a frame of its own, or a tab it opened or went to).
      for (const t of browser.tabs) {
        if (t.webContents.isDestroyed()) continue;
        const opened = !before.has(t.id) && t !== tab;
        for (const frame of t.webContents.mainFrame.framesInSubtree) {
          if (!/^noor:/.test(frame.url)) continue;
          if (t !== tab && !opened) continue;
          let bridge = "unknown";
          let answered = "unknown";
          try {
            bridge = await frame.executeJavaScript("typeof window.noor");
            answered = bridge === "object" ? await frame.executeJavaScript("window.noor.invoke('settings:get').then((s) => 'answered: ' + Object.keys(s).length + ' settings', (e) => 'refused: ' + e.message)") : "no bridge";
          } catch (error) {
            bridge = "error: " + String(error).split("\n")[0];
          }
          reached.push({ where: t === tab ? (frame === t.webContents.mainFrame ? "the tab itself" : "a frame of the site") : "a tab the site opened", url: frame.url, bridge, answered });
        }
      }
      const result = { tabURL: tab.webContents.isDestroyed() ? "closed" : tab.webContents.getURL(), reached };
      // Leave only the first tab for the next try.
      for (const t of browser.tabs.slice()) {
        if (!before.has(t.id)) browser.close(t);
      }
      return result;
    }, [`${base}/${name}`, TARGET, CLICKS[name] || null]);
  }
  await app.close().catch(() => {});
  server.close();

  console.log(JSON.stringify({ results, reports }, null, 1));
  const reachedAny = Object.entries(results).filter(([, r]) => r.reached.length > 0).map(([name]) => name);
  const fetchRead = /^READ/.test(reports.fetch || "");
  for (const [name, r] of Object.entries(results)) {
    console.log(`TRY ${name}: tab at ${r.tabURL}; ${r.reached.length ? "REACHED " + JSON.stringify(r.reached) : "no page of Noor's reached"}${reports[name] ? "; the page said: " + reports[name] : ""}`);
  }
  const failed = reachedAny.concat(fetchRead ? ["fetch"] : []);
  console.log(failed.length ? `APP PAGES: A SITE REACHED NOOR'S PAGES (${failed.join(", ")})` : "APP PAGES: no site reached a page of Noor's");
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
