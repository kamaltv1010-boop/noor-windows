// Whether a website can read a file of this computer. A file only this
// check knows is written in a new folder, a mark of its own in it; a site
// then tries every way a page has: fetch() of its file:// address, a frame
// of it, going to it, an image of it, a link to it the user clicks (a real
// click), and Noor's own pages' address leading out of their folder
// (noor://app/../ and its encoded forms). What the site gets back is sent
// to this check's server; the tab's own address and its frames' are read
// from the app. The mark must reach the site by no way.
// Prints what each try did; exits 1 if the site read the file.
// Needs Playwright and a display: `xvfb-run -a node tools/probe-local-files.js`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { pathToFileURL } = require("url");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MARK = "NOOR-FILE-" + crypto.randomBytes(8).toString("hex");
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "noor-localfiles-"));
const secret = path.join(folder, "secret.txt");
fs.writeFileSync(secret, MARK + "\n");
const FILE = pathToFileURL(secret).toString();
// Out of Noor's pages' folder (renderer/) to a file of the app's own.
const OUT = ["noor://app/../package.json", "noor://app/..%2fpackage.json", "noor://app/%2e%2e/package.json", "noor://app/..%5cpackage.json"];

const PAGES = {
  fetch: `<script>fetch(${JSON.stringify(FILE)}).then((r) => r.text()).then((t) => fetch("/report?try=fetch&got=" + encodeURIComponent("READ " + t)), (e) => fetch("/report?try=fetch&got=" + encodeURIComponent("blocked: " + e.message)));</script>`,
  xhr: `<script>try { const x = new XMLHttpRequest(); x.open("GET", ${JSON.stringify(FILE)}); x.onload = () => fetch("/report?try=xhr&got=" + encodeURIComponent("READ " + x.responseText)); x.onerror = () => fetch("/report?try=xhr&got=blocked"); x.send(); } catch (e) { fetch("/report?try=xhr&got=" + encodeURIComponent("blocked: " + e.message)); }</script>`,
  frame: `<iframe id="f" src="${FILE}"></iframe><script>setTimeout(() => { let got; try { got = "READ " + document.getElementById("f").contentDocument.body.innerText; } catch (e) { got = "blocked: " + e.message; } fetch("/report?try=frame&got=" + encodeURIComponent(got)); }, 2000);</script>`,
  image: `<img id="i" src="${FILE}"><script>const i = document.getElementById("i"); i.onload = () => fetch("/report?try=image&got=loaded"); i.onerror = () => fetch("/report?try=image&got=blocked");</script>`,
  navigate: `<script>setTimeout(() => { location.href = ${JSON.stringify(FILE)}; }, 300);</script>`,
  link: `<a id="b" href="${FILE}" style="display:block;width:300px;height:120px;font-size:30px">open</a>`,
  appFolder: `<script>Promise.all(${JSON.stringify(OUT)}.map((u) => fetch(u).then((r) => r.text()).then((t) => u + " READ " + t.slice(0, 60), (e) => u + " blocked: " + e.message))).then((all) => fetch("/report?try=appFolder&got=" + encodeURIComponent(all.join(" | "))));</script>`,
};
const CLICKED = new Set(["link"]);

(async () => {
  const reports = {};
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/report") {
      reports[url.searchParams.get("try")] = url.searchParams.get("got");
      res.end("ok");
      return;
    }
    const name = url.pathname.slice(1);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><title>${name}</title><p>a site</p>${PAGES[name] || ""}`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://files.test:${server.address().port}`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-localfiles-data-"));
  const env = { ...process.env, NOOR_TEST: "1", NOOR_TEST_TIMEZONE: "Africa/Casablanca", NOOR_USER_DATA: userData, NOOR_DEVICE: process.env.NOOR_DEVICE || "windows" };
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
    results[name] = await main(async (electron, [url, click, mark]) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const browser = global.noorTest.browser;
      const before = new Set(browser.tabs.map((t) => t.id));
      const tab = browser.newTab({ url });
      await wait(1500);
      if (click) {
        const rect = await tab.webContents.executeJavaScript("(() => { const r = document.getElementById('b').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()");
        tab.webContents.focus();
        for (const type of ["mouseDown", "mouseUp"]) {
          tab.webContents.sendInputEvent({ type, x: rect.x, y: rect.y, button: "left", clickCount: 1 });
          await wait(60);
        }
      }
      await wait(3000);
      // Where the tab, its frames and any tab it opened are, and whether
      // any of them shows the file.
      const shown = [];
      for (const t of browser.tabs) {
        if (t.webContents.isDestroyed() || (t !== tab && before.has(t.id))) continue;
        for (const frame of t.webContents.mainFrame.framesInSubtree) {
          let text = "";
          try {
            text = await frame.executeJavaScript("document.body ? document.body.innerText : ''");
          } catch (error) {
            text = "";
          }
          shown.push({ url: frame.url, hasMark: text.includes(mark) });
        }
      }
      const result = { tabURL: tab.webContents.isDestroyed() ? "closed" : tab.webContents.getURL(), frames: shown };
      for (const t of browser.tabs.slice()) {
        if (!before.has(t.id)) browser.close(t);
      }
      return result;
    }, [`${base}/${name}`, CLICKED.has(name), MARK]);
  }
  await app.close().catch(() => {});
  server.close();

  const read = [];
  for (const [name, r] of Object.entries(results)) {
    const said = reports[name] || "";
    // What the site got back, or a frame of its own page showing the file,
    // counts. The file shown as a tab of its own (a link the user clicked,
    // where Chromium allows it) is the user's doing and out of the site's
    // reach: said, not counted.
    const siteRead = said.includes(MARK) || r.frames.some((f) => f.hasMark && !/^file:/i.test(f.url));
    const ownTab = r.frames.some((f) => f.hasMark && /^file:/i.test(f.url));
    if (siteRead) read.push(name);
    console.log(`TRY ${name}: tab at ${r.tabURL}; frames ${JSON.stringify(r.frames.map((f) => f.url))}${said ? "; the site got: " + said.slice(0, 300) : ""}${ownTab && !siteRead ? "; (the file shown in a tab of its own, out of the site's reach)" : ""}`);
  }
  try { fs.rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch (error) {}
  console.log(read.length ? `LOCAL FILES: A SITE READ A FILE OF THIS COMPUTER (${read.join(", ")})` : "LOCAL FILES: no site read a file of this computer");
  process.exit(read.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
