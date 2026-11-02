// Whether a site can tell how its page was opened in Noor: an address typed
// in the address bar (or the start page's box), a bookmark on the start
// page, a bookmark in the Library, a pinned site. In Chrome these all look
// the same to the site: no Referer, Sec-Fetch-Site "none", no page that
// sent the user there. Recorded for each: what the server is sent (the
// Sec-Fetch-* headers, Referer, Upgrade-Insecure-Requests) and what the
// page reads (document.referrer, its navigation's type, history.length,
// whether it has an opener). Each one opens in a new tab, as a user does.
// Prints every way side by side; exits 1 if any differs from typing.
// Needs Playwright and a display: `xvfb-run -a node tools/probe-navigation-source.js`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const HEADERS = ["sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "sec-fetch-user", "referer", "upgrade-insecure-requests"];

(async () => {
  const seen = {};
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/report") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const report = JSON.parse(body);
          seen[report.way] = Object.assign(seen[report.way] || {}, { page: report });
        } catch (error) {
          // Not ours.
        }
        res.end("ok");
      });
      return;
    }
    if (url.pathname.startsWith("/open/")) {
      const way = url.pathname.slice("/open/".length);
      seen[way] = Object.assign(seen[way] || {}, { headers: Object.fromEntries(HEADERS.map((h) => [h, req.headers[h] === undefined ? null : req.headers[h]])) });
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(`<!doctype html><title>${way}</title><p>${way}</p><script>
const entry = performance.getEntriesByType("navigation")[0];
fetch("/report", { method: "POST", body: JSON.stringify({ way: ${JSON.stringify(way)}, referrer: document.referrer, type: entry ? entry.type : null, historyLength: history.length, opener: window.opener !== null }) });
</script>`);
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  // (127.0.0.1: a secure context for Chromium, sent the Sec-Fetch-* headers
  // as an https site is; a plain http site is sent none.)
  const base = `http://127.0.0.1:${server.address().port}`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-navsource-"));
  const env = { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: userData, NOOR_DEVICE: process.env.NOOR_DEVICE || "windows" };
  const electronPath = require(path.join(root, "node_modules", "electron"));
  const app = await electron.launch({ executablePath: electronPath, args: [root, "--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1"], env });
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  await sleep(1000);

  // Each way, in a new tab: what the user does to open the site.
  const ways = {
    // The address bar: typed, then Enter (what chrome.js does on Enter).
    typed: (url) => main(async (electron, url) => {
      const browser = global.noorTest.browser;
      browser.newTab();
      await new Promise((r) => setTimeout(r, 1500));
      await browser.chrome.webContents.executeJavaScript(`(() => { const a = document.getElementById("address"); a.focus(); a.value = ${JSON.stringify(url)}; a.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); })()`);
    }, url),
    // The start page's box: typed, then Enter.
    startBox: (url) => main(async (electron, url) => {
      const browser = global.noorTest.browser;
      const tab = browser.newTab();
      await new Promise((r) => setTimeout(r, 1500));
      await tab.webContents.executeJavaScript(`(() => { document.getElementById("q").value = ${JSON.stringify(url)}; document.getElementById("search").requestSubmit(); })()`);
    }, url),
    // A bookmark, on the start page.
    startBookmark: (url) => main(async (electron, url) => {
      const browser = global.noorTest.browser;
      global.noorTest.context.bookmarks.toggle("Site", url);
      global.noorTest.windows.pushState();
      const tab = browser.newTab();
      await new Promise((r) => setTimeout(r, 1500));
      await tab.webContents.executeJavaScript(`(() => { const fav = [...document.querySelectorAll("#favorites .fav")].find((f) => f.title === ${JSON.stringify(url)}); fav.click(); return Boolean(fav); })()`);
    }, url),
    // A bookmark, in the Library.
    libraryBookmark: (url) => main(async (electron, url) => {
      const browser = global.noorTest.browser;
      global.noorTest.context.bookmarks.toggle("Site", url);
      const tab = browser.newTab({ url: "noor://app/library.html" });
      await new Promise((r) => setTimeout(r, 1500));
      await tab.webContents.executeJavaScript(`(() => { const item = [...document.querySelectorAll(".item .text")].find((t) => t.textContent.includes(${JSON.stringify(url)})); item.click(); return Boolean(item); })()`);
    }, url),
  };
  // A pinned site, where Noor has them.
  const pins = await main(() => Boolean(global.noorTest.context.pins));
  if (pins) {
    ways.pinned = (url) => main(async (electron, url) => {
      const browser = global.noorTest.browser;
      global.noorTest.context.pins.add("Site", url);
      global.noorTest.windows.pushState();
      const tab = browser.newTab();
      await new Promise((r) => setTimeout(r, 1500));
      await tab.webContents.executeJavaScript(`(() => { const pin = [...document.querySelectorAll("#pins .pin")].find((p) => p.dataset.url === ${JSON.stringify(url)}); pin.click(); return Boolean(pin); })()`);
    }, url);
  }
  const errors = {};
  for (const [way, open] of Object.entries(ways)) {
    try {
      await open(`${base}/open/${way}`);
    } catch (error) {
      errors[way] = String(error).split("\n")[0];
    }
    for (let i = 0; i < 100 && !(seen[way] && seen[way].page); i++) await sleep(100);
  }
  // Pinning, where Noor has it: the ⋯ menu's "Pin this page" keeps the
  // page's address less its tracking codes (what one would type), and so
  // does a link's "Pin Link"; the toolbar is told the page is pinned.
  let pinning = null;
  if (pins) {
    pinning = await main(async (electron, base) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const browser = global.noorTest.browser;
      const tab = browser.newTab({ url: `${base}/open/page?utm_source=news&id=7` });
      for (let i = 0; i < 100 && !tab.url.includes("/open/page"); i++) await wait(50);
      await wait(500);
      const pinnedNow = browser.togglePin();
      const afterPage = global.noorTest.context.pins.all().map((p) => p.url);
      const shown = browser.state().pinned;
      browser.pinLink(`${base}/open/link?fbclid=abc&x=1`);
      const afterLink = global.noorTest.context.pins.all().map((p) => p.url);
      const unpinned = browser.togglePin() === false && !global.noorTest.context.pins.all().some((p) => p.url.includes("/open/page"));
      return { pinnedNow, afterPage, shown, afterLink, unpinned };
    }, base);
  }
  await app.close().catch(() => {});
  server.close();
  const pinChecks = pinning ? {
    pinsThePage: pinning.pinnedNow === true && pinning.afterPage.includes(`${base}/open/page?id=7`) && pinning.shown === true,
    pinsALink: pinning.afterLink.includes(`${base}/open/link?x=1`),
    unpins: pinning.unpinned === true,
  } : {};

  // Each way against typing.
  const typed = seen.typed || {};
  const differences = {};
  for (const way of Object.keys(ways)) {
    const got = seen[way] || {};
    const diff = [];
    if (!got.headers || !got.page) {
      diff.push(errors[way] || "never opened");
    } else {
      for (const h of HEADERS) {
        if (got.headers[h] !== (typed.headers || {})[h]) diff.push(`${h}: ${got.headers[h]} (typed: ${(typed.headers || {})[h]})`);
      }
      for (const k of ["referrer", "type", "historyLength", "opener"]) {
        if (got.page[k] !== (typed.page || {})[k]) diff.push(`${k}: ${JSON.stringify(got.page[k])} (typed: ${JSON.stringify((typed.page || {})[k])})`);
      }
    }
    differences[way] = diff;
  }
  console.log(JSON.stringify({ seen, differences }, null, 1));
  for (const way of Object.keys(ways)) {
    const got = seen[way] || {};
    console.log(`WAY ${way}: headers ${JSON.stringify(got.headers || null)}; page ${JSON.stringify(got.page || null)}; ${differences[way].length ? "DIFFERS: " + differences[way].join("; ") : "same as typed"}`);
  }
  if (pinning) {
    console.log(`PINNING: ${JSON.stringify(pinning)}; ${JSON.stringify(pinChecks)}`);
  }
  const failed = Object.keys(differences).filter((way) => differences[way].length).concat(Object.keys(pinChecks).filter((name) => !pinChecks[name]));
  console.log(failed.length ? `NAVIGATION SOURCE: DIFFERS (${failed.join(", ")})` : "NAVIGATION SOURCE: every way looks the same to the site");
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
