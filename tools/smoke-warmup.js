// Runs "Collect cookies" (main/warmup.js) in the app against sites of its
// own (warm-a.test, warm-b.test, warm-c.test, all this computer) and checks
// what the profile in use got: each site's cookies, set by the server and by
// its scripts, the cookie banner accepted with a real tap or click, the page
// scrolled, an article of the site opened from its page; and what it
// didn't: a link that signs out, an account's page, a file, a window the
// page tried to open, a dialog, history, a tab. A site that doesn't answer
// is counted and passed. With "iphone", in Noor iPhone. Needs Playwright and
// a display: on Linux, `xvfb-run -a node tools/smoke-warmup.js [iphone]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const iphone = process.argv[2] === "iphone";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SITES = ["a", "b", "c"];

const page = (site, port) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Site ${site}</title></head>
<body style="margin:0;font:16px sans-serif">
<div id="onetrust-banner-sdk" style="position:fixed;left:0;right:0;bottom:0;padding:14px;background:#eee;z-index:9">We use cookies.
<button id="onetrust-accept-btn-handler" style="padding:12px 18px">Accept All Cookies</button></div>
<h1>Site ${site}</h1>
<p><a href="/logout">Log out</a> · <a href="/account/settings">Your account settings</a> · <a href="/files/report.pdf">The yearly report, in full</a> · <a href="http://warm-${site === "a" ? "b" : "a"}.test:${port}/elsewhere">Another site's long story here</a></p>
<p><a href="/news/a-long-article-about-the-weather-today">A long article about the weather today</a></p>
<div style="height:5000px;background:linear-gradient(#fff,#bbb)"></div>
<script>
  const set = (name, value) => { document.cookie = name + "_${site}=" + encodeURIComponent(value) + "; path=/; max-age=86400"; };
  set("js", "1");
  set("ua", navigator.userAgent);
  set("vis", document.visibilityState);
  set("webdriver", String(navigator.webdriver));
  document.getElementById("onetrust-accept-btn-handler").addEventListener("click", (event) => {
    set("consent", event.isTrusted ? "trusted" : "untrusted");
    document.getElementById("onetrust-banner-sdk").remove();
  });
  addEventListener("scroll", () => { if (scrollY > 100) set("scrolled", "1"); }, { passive: true });
  setTimeout(() => {
    try { window.open("/popup"); } catch (e) {}
    try { alert("hello"); } catch (e) {}
    set("dialog", "passed");
  }, 50);
</script>
</body></html>`;

// Playwright, attached to every page of the app, hears of the dialog the
// page asks for and then finds none to dismiss (the hidden tab shows none):
// that is Playwright's, not the app's.
const playwrights = (error) => /No dialog is showing/.test(String(error && error.message));
process.on("unhandledRejection", (error) => { if (!playwrights(error)) { console.error(error); process.exit(1); } });
process.on("uncaughtException", (error) => { if (!playwrights(error)) { console.error(error); process.exit(1); } });

(async () => {
  const hits = [];
  const server = http.createServer((req, res) => {
    const host = String(req.headers.host || "").split(".")[0].replace(/^warm-/, "");
    const url = req.url.split("?")[0];
    hits.push(`${host} ${url}${req.headers.referer ? " from " + req.headers.referer : ""}`);
    res.setHeader("cache-control", "no-store");
    if (url === "/") {
      res.setHeader("set-cookie", `site_${host}=1; Path=/; Max-Age=86400`);
      res.setHeader("content-type", "text/html; charset=utf-8");
      return res.end(page(host, server.address().port));
    }
    if (url.startsWith("/news/")) {
      res.setHeader("set-cookie", `article_${host}=1; Path=/; Max-Age=86400`);
      res.setHeader("content-type", "text/html; charset=utf-8");
      return res.end(`<!doctype html><title>Article</title><p>An article.</p><div style="height:3000px"></div>`);
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end("<!doctype html><title>Other</title>other");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const sites = SITES.map((site) => `http://warm-${site}.test:${port}/`).concat([`http://warm-dead.test:1/`]);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-warmup-"));
  const app = await electron.launch({
    executablePath: require(path.join(root, "node_modules", "electron")),
    args: [root, "--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1"].concat(process.env.SMOKE_VERBOSE ? ["--enable-logging=stderr"] : []),
    env: {
      ...process.env,
      NOOR_TEST: "1",
      NOOR_USER_DATA: userData,
      NOOR_DEVICE: iphone ? "iphone" : "windows",
      NOOR_TEST_TIMEZONE: "Africa/Casablanca",
      NOOR_TEST_WARMUP_SITES: JSON.stringify(sites),
      NOOR_TEST_WARMUP_FAST: "1",
      NOOR_TEST_WARMUP_FOLLOW: "1",
    },
  });
  app.process().stderr.on("data", (data) => { if (process.env.SMOKE_VERBOSE) process.stderr.write("[electron] " + data); });
  app.process().on("exit", (code, signal) => { if (process.env.SMOKE_VERBOSE) console.error(`[electron] exited: code ${code}, signal ${signal}`); });
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected))) break;
    await sleep(100);
  }
  await sleep(1500);
  const before = await main(() => ({ tabs: global.noorTest.browser.tabs.length, history: global.noorTest.browser.history.all().length }));
  const started = await main(() => global.noorTest.warmup.start(4));
  const seen = [];
  const until = Date.now() + 150000;
  let status = started;
  while (Date.now() < until) {
    status = await main(() => global.noorTest.warmup.status());
    if (status.current && !seen.includes(status.current)) seen.push(status.current);
    if (!status.running) break;
    await sleep(300);
  }
  // Stopped halfway: the hidden tab goes at once, and it says so.
  const stopped = await main(async () => {
    const warmup = global.noorTest.warmup;
    await warmup.start(3);
    for (let i = 0; i < 100 && !warmup.status().current; i++) await new Promise((r) => setTimeout(r, 50));
    warmup.stop();
    const right = { running: warmup.status().running, hidden: global.noorTest.browser.backgroundTabs.length };
    for (let i = 0; i < 100 && warmup.status().running; i++) await new Promise((r) => setTimeout(r, 50));
    return { right, after: warmup.status() };
  });
  // The settings page, as the user sees it.
  const settings = await main(async (electron) => {
    const browser = global.noorTest.browser;
    const tab = browser.newTab({ url: "noor://app/settings.html#cookies" });
    await new Promise((r) => setTimeout(r, 2500));
    const text = await tab.webContents.executeJavaScript("document.getElementById('warmupstatus').textContent + ' | ' + document.getElementById('warmupstart').textContent");
    const shot = (await tab.webContents.capturePage()).toPNG().toString("base64");
    browser.close(tab);
    return { text, shot };
  });
  fs.writeFileSync(path.join(userData, "settings.png"), Buffer.from(settings.shot, "base64"));
  const after = await main(async (electron) => {
    const browser = global.noorTest.browser;
    const cookies = await electron.session.fromPartition(browser.partitionFor(false)).cookies.get({});
    return {
      cookies: cookies.map((c) => `${c.domain} ${c.name}=${decodeURIComponent(c.value)}`),
      tabs: browser.tabs.length,
      backgroundTabs: browser.backgroundTabs.length,
      history: browser.history.all().map((entry) => entry.url),
      windows: electron.BrowserWindow.getAllWindows().length + electron.BaseWindow.getAllWindows().length,
    };
  });
  await app.close();
  server.close();

  const failures = [];
  const check = (name, ok, detail) => { if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`); };
  const cookie = (site, name) => {
    const found = after.cookies.find((c) => c.startsWith(`warm-${site}.test ${name}_${site}=`));
    return found ? found.slice(found.indexOf("=") + 1) : null;
  };
  check("visits counted, the dead site passed", !status.running && status.finished && status.total === 4 && status.done === 4 && status.failed === 1 && status.added >= 18, status);
  for (const site of SITES) {
    check(`${site}: the server's and the page's cookies`, cookie(site, "site") === "1" && cookie(site, "js") === "1", after.cookies);
    check(`${site}: the banner accepted with a real ${iphone ? "tap" : "click"}`, cookie(site, "consent") === "trusted", cookie(site, "consent"));
    check(`${site}: the page scrolled`, cookie(site, "scrolled") === "1", after.cookies);
    check(`${site}: a dialog the page asked for didn't hold it`, cookie(site, "dialog") === "passed", cookie(site, "dialog"));
    check(`${site}: an article of the site opened from its page`, cookie(site, "article") === "1" && hits.some((h) => h.startsWith(`${site} /news/`) && h.includes(`from http://warm-${site}.test:${port}/`)), hits);
    check(`${site}: the page shown, with the profile's protection`, cookie(site, "vis") === "visible" && cookie(site, "webdriver") === "false" && (iphone ? /iPhone/.test(cookie(site, "ua")) : /Windows NT.*Chrome\//.test(cookie(site, "ua"))), { vis: cookie(site, "vis"), ua: cookie(site, "ua"), webdriver: cookie(site, "webdriver") });
  }
  const never = hits.filter((h) => / \/(logout|account|files|popup|elsewhere)/.test(h));
  check("no sign-out, account, file, window or other site", never.length === 0, never);
  check("no tab, window, history or hidden tab left", after.tabs === before.tabs && after.backgroundTabs === 0 && after.history.length === before.history && after.windows === 1, { before, after: { tabs: after.tabs, backgroundTabs: after.backgroundTabs, history: after.history, windows: after.windows } });
  check("what was under way was told", SITES.every((site) => seen.includes(`warm-${site}.test`)), seen);
  check("stopped halfway: at once, and said", stopped.right.running === false && stopped.right.hidden === 0 && stopped.after.stopped === true && stopped.after.finished === true, stopped);
  check("the settings show the profile's cookies", /This profile has \d+ cookies from \d+ sites|Stopped: /.test(settings.text) && / \| Collect$/.test(settings.text), settings.text);
  console.log("settings:", settings.text, "screenshot:", path.join(userData, "settings.png"));
  console.log(JSON.stringify({ iphone, status, hits: hits.length, failures }, null, 2));
  process.exit(failures.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
