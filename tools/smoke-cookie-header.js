// The shown page's cookies as its Cookie header, through the app as a user
// reaches it: a site sets three cookies in one profile (one HttpOnly, one
// for the whole site); Ctrl+O (the application menu's shortcut) copies
// "name=value; …" with all three; ⋯ › Cookies has "Copy cookies of this
// page" (Ctrl+O) and "Paste cookies into this page…"; in another profile,
// on the same site with none of them, "Paste cookies…" opens the toolbar's
// line filled with the clipboard's text, and Paste sets them and loads the
// page again, which the site gets with them. On a page that isn't a site's,
// nothing is copied. Needs Playwright and a display: on Linux,
// `xvfb-run -a node tools/smoke-cookie-header.js [windows|iphone|android]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const BUILD = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  // The site: sets its cookies on /set, and notes the Cookie header of each
  // page asked for (by ?who=…).
  const got = {};
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://win.test");
    if (url.pathname === "/set") {
      res.setHeader("set-cookie", [
        "a=1; Path=/; Max-Age=86400",
        "b=two; Path=/; HttpOnly; Max-Age=86400",
        "c=whole=site; Domain=win.test; Path=/; Max-Age=86400",
      ]);
    }
    const who = url.searchParams.get("who");
    if (who) {
      got[who] = (got[who] || []).concat([req.headers.cookie || ""]);
    }
    res.setHeader("cache-control", "no-store");
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><title>cookies ${url.pathname}</title><p>${url.pathname}</p>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://www.win.test:${server.address().port}`;

  const app = await electron.launch({
    executablePath: require(path.join(root, "node_modules", "electron")),
    args: [root, "--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1"],
    env: { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), "noor-cookie-header-")), NOOR_DEVICE: BUILD, NOOR_TEST_TIMEZONE: "Africa/Casablanca" },
  });
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  await sleep(1200);
  const steps = [];
  const step = (name, ok, detail) => {
    steps.push(ok);
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : ": " + JSON.stringify(detail)}`);
  };
  /// Opens `url` in the window in front, and waits for it to be loaded.
  const visit = async (url) => {
    await main((electron, address) => { global.noorTest.browser.newTab({ url: address }); }, url);
    for (let i = 0; i < 80; i++) {
      const state = await main((electron, address) => {
        const contents = global.noorTest.browser.selected.webContents;
        return contents.getURL() === address ? contents.executeJavaScript("document.readyState") : null;
      }, url).catch(() => null);
      if (state === "complete") break;
      await sleep(250);
    }
    await sleep(300);
  };

  // 1. The site sets its cookies in the first profile.
  await visit(`${base}/set?who=first`);
  await visit(`${base}/page?who=first`);
  step("the site's three cookies are set in the first profile", /a=1/.test((got.first || [])[1] || "") && /b=two/.test((got.first || [])[1] || "") && /c=whole=site/.test((got.first || [])[1] || ""), got.first);

  // 2. ⋯ › Cookies: copy and paste, copy with Ctrl+O.
  const items = await main(() => global.noorTest.browser.menus.cookieItems().filter((item) => item.label).map((item) => ({ label: item.label, shortcut: item.shortcut || "", enabled: item.enabled !== false })));
  step("⋯ › Cookies: Copy cookies of this page (Ctrl+O) and Paste cookies into this page…", items.some((i) => i.label === "Copy cookies of this page" && i.shortcut === "Ctrl+O" && i.enabled) && items.some((i) => i.label === "Paste cookies into this page…" && i.enabled), items);

  // 3. Ctrl+O, as the application menu has it: the page's Cookie header copied.
  await main(({ clipboard }) => clipboard.writeText("before"));
  const shortcut = await main(({ Menu }) => {
    const find = (menu) => {
      for (const item of menu.items) {
        if (item.accelerator === "CmdOrCtrl+O") return item;
        if (item.submenu) { const inner = find(item.submenu); if (inner) return inner; }
      }
      return null;
    };
    const item = find(Menu.getApplicationMenu());
    if (!item) return null;
    item.click();
    return item.label;
  });
  let copied = "";
  for (let i = 0; i < 40; i++) {
    copied = await main(({ clipboard }) => clipboard.readText());
    if (copied !== "before") break;
    await sleep(100);
  }
  const pairs = copied.split("; ").sort();
  step("Ctrl+O copies the page's Cookie header: all three, the HttpOnly one too", shortcut === "Copy Cookies of This Page" && JSON.stringify(pairs) === JSON.stringify(["a=1", "b=two", "c=whole=site"]), { shortcut, copied });

  // 4. A page that isn't a site's: nothing copied.
  await main(({ clipboard }) => clipboard.writeText("kept"));
  await main(async () => {
    const browser = global.noorTest.browser;
    browser.newTab({ url: "noor://app/start.html" });
    await new Promise((resolve) => setTimeout(resolve, 800));
    await browser.copyCookies();
  });
  step("on a page of the app's own, nothing is copied", (await main(({ clipboard }) => clipboard.readText())) === "kept");
  await main(({ clipboard }, text) => clipboard.writeText(text), copied);

  // 5. Another profile, on the same site, with none of them.
  await main(() => { global.noorTest.windows.createProfile("Paste"); });
  for (let i = 0; i < 100; i++) {
    if (await main(() => global.noorTest.browser.profile.name === "Paste" && Boolean(global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  await sleep(1500);
  await visit(`${base}/page?who=second`);
  step("the other profile has none of them", (got.second || [])[0] === "", got.second);

  // 6. Paste cookies…: the toolbar's line, filled with the clipboard's text;
  // Paste sets them and loads the page again.
  await main(() => global.noorTest.browser.pasteCookies());
  let line = null;
  for (let i = 0; i < 40; i++) {
    line = await main(() => global.noorTest.browser.chrome.webContents.executeJavaScript('({ shown: !document.getElementById("prompt").hidden, value: document.getElementById("promptinput").value, title: document.getElementById("prompttitle").textContent, button: document.getElementById("promptok").textContent })')).catch(() => null);
    if (line && line.shown) break;
    await sleep(100);
  }
  step("Paste cookies… shows the toolbar's line with the copied text", line && line.shown && line.value === copied && /^Cookies for www\.win\.test$/.test(line.title) && line.button === "Paste", line);
  const before = (got.second || []).length;
  await main(() => global.noorTest.browser.chrome.webContents.executeJavaScript('document.getElementById("prompt").requestSubmit()'));
  for (let i = 0; i < 60 && (got.second || []).length <= before; i++) await sleep(100);
  const after = (got.second || []).slice(-1)[0] || "";
  step("Paste sets them, and the page loads again with them", ["a=1", "b=two", "c=whole=site"].every((pair) => after.split("; ").includes(pair)), got.second);
  const stored = await main(async () => {
    const tab = global.noorTest.browser.selected;
    const cookies = await tab.webContents.session.cookies.get({ url: tab.url });
    return cookies.map((c) => ({ name: c.name, domain: c.domain, path: c.path, httpOnly: c.httpOnly, session: c.session })).sort((x, y) => x.name.localeCompare(y.name));
  });
  step("pasted for the whole site, kept after the browser closes (not session cookies)", stored.length === 3 && stored.every((c) => c.domain === ".win.test" && c.path === "/" && !c.session), stored);

  // 7. A bad text: told, nothing set.
  await main(() => global.noorTest.browser.importCookies("no cookie here"));
  const toast = await main(() => global.noorTest.browser.chrome.webContents.executeJavaScript('document.getElementById("toast").textContent'));
  step("a text with no cookie: told so", /No cookie/i.test(toast), toast);

  await app.close().catch(() => {});
  server.close();
  const ok = steps.every(Boolean);
  console.log(ok ? "COOKIE HEADER SMOKE OK" : "COOKIE HEADER SMOKE FAILED");
  process.exit(ok ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
