// Whether what a site writes runs as code in Noor's own pages, which hold
// the app's calls (window.noor: the settings, the profiles, every
// profile's cookies): a site's title shows in the toolbar's tab, in the
// history and the favorites (the library, the start page), its cookies in
// the Cookies page. A site served here puts HTML in all of them (a title,
// cookie names and values) whose code, if it ever ran, counts itself on
// the page it ran in (window.__noorXSS); the page is then bookmarked and
// pinned, and every page of Noor's that shows them is opened. On each: the
// count (must stay 0), and whether the site's text is there to be read,
// as text (or the check didn't see what it meant to).
// Prints what each page showed; exits 1 if any code of the site ran.
// Needs Playwright and a display: `xvfb-run -a node tools/probe-app-xss.js`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Counts itself where it runs; "XSS-MARK" lets the text be found.
const RUN = "(window.top.__noorXSS=(window.top.__noorXSS||0)+1)";
const TITLE = `XSS-MARK <img src=x onerror="${RUN}"><svg onload="${RUN}">`;
const COOKIE_NAME = `xss<img src=x onerror=${RUN}>`;
const COOKIE_VALUE = `<svg/onload=${RUN}>XSS-MARK`;

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("set-cookie", [`${encodeURIComponent(COOKIE_NAME)}=${encodeURIComponent(COOKIE_VALUE)}; Path=/; Max-Age=3600`]);
    res.end(`<!doctype html><title>${TITLE.replace(/</g, "&lt;")}</title><p>a site</p><script>document.cookie = ${JSON.stringify(`raw<b>=${COOKIE_VALUE}; path=/; max-age=3600`)}; document.title = ${JSON.stringify(TITLE)};</script>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://xss.test:${server.address().port}`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-xss-"));
  const env = { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: userData, NOOR_DEVICE: process.env.NOOR_DEVICE || "windows" };
  const electronPath = require(path.join(root, "node_modules", "electron"));
  const app = await electron.launch({ executablePath: electronPath, args: [root, "--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1"], env });
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  await sleep(1000);

  const report = await main(async (electron, base) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const browser = global.noorTest.browser;
    // The site, visited (history), bookmarked and pinned.
    const site = browser.newTab({ url: `${base}/page` });
    for (let i = 0; i < 100 && !(site.title || "").startsWith("XSS-MARK"); i++) await wait(100);
    await wait(500);
    browser.toggleBookmark();
    browser.togglePin();
    await wait(500);
    // Noor's pages that show what the site wrote.
    const opened = {};
    for (const [name, url] of Object.entries({ library: "noor://app/library.html", cookies: "noor://app/cookies.html", start: "noor://app/start.html" })) {
      opened[name] = browser.newTab({ url });
    }
    await wait(4000);
    // The cookies page lists sites; searched for, a site shows its cookies
    // (names and values).
    try {
      await opened.cookies.webContents.executeJavaScript("(() => { const box = document.getElementById('q'); box.value = 'xss'; box.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
    } catch (error) {
      // Its layout as it is.
    }
    // The library: history and favorites, searched for the site.
    try {
      await opened.library.webContents.executeJavaScript("(() => { const box = document.querySelector('input[type=search], input'); if (box) { box.value = 'XSS'; box.dispatchEvent(new Event('input', { bubbles: true })); } return Boolean(box); })()");
    } catch (error) {
      // Its layout as it is.
    }
    await wait(2500);
    const look = async (contents) => {
      if (!contents || contents.isDestroyed()) return { gone: true };
      return contents.executeJavaScript("({ url: location.href, ran: window.__noorXSS || 0, shows: document.body ? document.body.innerText.includes('XSS-MARK') : false })").catch((error) => ({ error: String(error).split("\n")[0] }));
    };
    const pages = {};
    for (const [name, tab] of Object.entries(opened)) pages[name] = await look(tab.webContents);
    pages.toolbar = await look(browser.chrome.webContents);
    browser.select(site);
    await wait(800);
    pages.toolbarWithTheSite = await look(browser.chrome.webContents);
    pages.site = await look(site.webContents);
    return pages;
  }, base);
  await app.close().catch(() => {});
  server.close();

  console.log(JSON.stringify(report, null, 1));
  const noor = Object.entries(report).filter(([name]) => name !== "site");
  const ran = noor.filter(([, p]) => p.ran > 0).map(([name]) => name);
  for (const [name, p] of Object.entries(report)) {
    console.log(`PAGE ${name}: ${p.url || ""} code of the site ran ${p.ran || 0} times; its text ${p.shows ? "shown as text" : "not shown"}${p.error ? "; " + p.error : ""}`);
  }
  const shown = noor.filter(([, p]) => p.shows).map(([name]) => name);
  console.log(ran.length ? `APP XSS: THE SITE'S CODE RAN IN NOOR'S PAGES (${ran.join(", ")})` : `APP XSS: no code of the site ran in Noor's pages (its text shown as text in: ${shown.join(", ") || "none"})`);
  process.exit(ran.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
