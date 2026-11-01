// Runs "Collect cookies" (main/warmup.js) in the app against sites of its
// own (warm-a.test, warm-b.test, warm-c.test, all this computer) and checks
// what the profile in use got: each site's cookies, set by the server and by
// its scripts, the cookie banner accepted with a real tap or click, the page
// scrolled, an article of the site opened from its page; and what it
// didn't: a link that signs out, an account's page, a file, a window the
// page tried to open, a dialog, history, a tab. A site that doesn't answer
// is counted and passed. With "iphone", in Noor iPhone; with "android", in
// Noor Android. Needs Playwright and a display: on Linux,
// `xvfb-run -a node tools/smoke-warmup.js [iphone|android]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const build = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
/// A device's build: its pages are touched with a finger.
const iphone = build !== "windows";
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
  set("screen", screen.width + "x" + screen.height);
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
    if (url.startsWith("/mine")) {
      res.setHeader("set-cookie", `mine_${host}=1; Path=/; Max-Age=86400`);
      res.setHeader("content-type", "text/html; charset=utf-8");
      return res.end(`<!doctype html><title>Mine</title><p>One of the user's sites.</p><div style="height:3000px"></div>`);
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
    args: [root, "--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1"].concat(process.env.SMOKE_EXTRA ? [process.env.SMOKE_EXTRA] : []).concat(process.env.SMOKE_VERBOSE ? ["--enable-logging=stderr"] : []),
    env: {
      ...process.env,
      NOOR_TEST: "1",
      NOOR_USER_DATA: userData,
      NOOR_DEVICE: build,
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
  // The user's own sites, saved: those are visited, and only those.
  const mine = await main(async (electron, sites) => {
    const warmup = global.noorTest.warmup;
    warmup.saveSettings({ mode: "mine", sites: sites.join("\n") });
    const started = await warmup.start();
    for (let i = 0; i < 600 && warmup.status().running; i++) await new Promise((r) => setTimeout(r, 100));
    const cookies = await electron.session.fromPartition(global.noorTest.browser.partitionFor(false)).cookies.get({});
    return { started: { total: started.total, mine: started.mine }, status: warmup.status(), settings: warmup.settings(), cookies: cookies.map((c) => `${c.domain} ${c.name}`) };
  }, [`http://warm-b.test:${port}/mine-page`]);
  // The settings page shows them saved.
  const form = await main(async () => {
    const browser = global.noorTest.browser;
    const tab = browser.newTab({ url: "noor://app/settings.html#cookies" });
    await new Promise((r) => setTimeout(r, 2000));
    const shown = await tab.webContents.executeJavaScript("({ mode: document.getElementById('warmupmode').value, sites: document.getElementById('warmupsites').value, countHidden: document.getElementById('warmupcountrow').hidden, saved: document.getElementById('warmupsaved').textContent })");
    browser.close(tab);
    return shown;
  });
  // A new profile collects by itself, where the settings say so.
  const auto = await main(async (electron, sites) => {
    const warmup = global.noorTest.warmup;
    const browser = global.noorTest.browser;
    warmup.saveSettings({ mode: "mine", sites: sites.join("\n"), auto: true });
    const profile = browser.createProfile("Auto");
    for (let i = 0; i < 100 && !warmup.status().running; i++) await new Promise((r) => setTimeout(r, 50));
    const began = warmup.status().running;
    for (let i = 0; i < 600 && warmup.status().running; i++) await new Promise((r) => setTimeout(r, 100));
    const listed = await global.noorTest.cookies.list(profile);
    return { began, profileId: profile.id, status: warmup.status(), sites: listed.sites.map((s) => `${s.site}:${s.count}`) };
  }, [`http://warm-c.test:${port}/mine-auto`]);
  // The Cookies page of that profile; a site's cookies taken away; all of
  // them as a cookies.txt file.
  const viewer = await main(async () => {
    const browser = global.noorTest.browser;
    const tab = browser.newTab({ url: "noor://app/cookies.html" });
    await new Promise((r) => setTimeout(r, 2000));
    const shown = await tab.webContents.executeJavaScript("({ summary: document.getElementById('summary').textContent, sites: [...document.querySelectorAll('.site .name')].map((e) => e.textContent), profile: document.getElementById('profile').selectedOptions[0].textContent })");
    await tab.webContents.executeJavaScript("document.querySelector('.site .head').click()");
    await new Promise((r) => setTimeout(r, 400));
    const rows = await tab.webContents.executeJavaScript("document.querySelectorAll('.site table tr').length");
    const shot = (await tab.webContents.capturePage()).toPNG().toString("base64");
    const profile = browser.profile;
    const exported = await global.noorTest.cookies.exported(profile, "txt");
    const removed = await global.noorTest.cookies.removeSite(profile, "warm-c.test");
    const left = await global.noorTest.cookies.list(profile);
    browser.close(tab);
    return { shown, rows, shot, exported: exported.text.startsWith("# Netscape HTTP Cookie File") && exported.text.includes("warm-c.test\tFALSE\t/\tFALSE"), removed, left: left.total };
  });
  fs.writeFileSync(path.join(userData, "cookies.png"), Buffer.from(viewer.shot, "base64"));
  // Several profiles at once, from the settings page: the profile in use
  // stays, and the new ones all collect their cookies at the same time, in
  // the background, each with its own fingerprints, not the profile in
  // use's. With one at a time, the others wait their turn.
  const many = await main(async (electron, sites) => {
    const browser = global.noorTest.browser;
    const warmup = global.noorTest.warmup;
    warmup.saveSettings({ mode: "mine", sites: sites.join("\n"), auto: true, parallel: 0 });
    const inUse = browser.profile;
    const before = global.noorTest.context.profiles.all().length;
    const tab = browser.newTab({ url: "noor://app/settings.html" });
    await new Promise((r) => setTimeout(r, 1500));
    const select = await tab.webContents.executeJavaScript("({ value: document.getElementById('warmupparallel').value, label: document.getElementById('warmupparallel').selectedOptions[0].textContent })");
    await tab.webContents.executeJavaScript("document.getElementById('manycount').value = '3'; document.getElementById('manyname').value = 'Farm'; document.getElementById('manycreate').click();");
    let waited = false;
    let most = 0;
    let hint = "";
    const toasts = new Set();
    for (let i = 0; i < 1200 && (warmup.running || i < 10); i++) {
      const now = warmup.overview();
      most = Math.max(most, now.running.length);
      waited = waited || now.waiting.length > 0;
      if (i % 4 === 0) {
        const shown = await tab.webContents.executeJavaScript("document.getElementById('warmupallhint').textContent").catch(() => "");
        if (/^Collecting in 3 profiles at once/.test(shown)) hint = shown;
        toasts.add(await browser.chrome.webContents.executeJavaScript("document.getElementById('toast').textContent").catch(() => ""));
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    const listed = await tab.webContents.executeJavaScript("[...document.querySelectorAll('#profiles .row .label')].map((l) => l.firstChild.textContent)");
    const farmsMade = global.noorTest.context.profiles.all().filter((p) => /^Farm \d+$/.test(p.name));
    const firstRun = new Map(farmsMade.map((profile) => [profile.id, warmup.status(profile.id)]));
    // One at a time: chosen on the page, the second profile waits its turn.
    await tab.webContents.executeJavaScript("const s = document.getElementById('warmupparallel'); s.value = '1'; s.dispatchEvent(new Event('change'));");
    await new Promise((r) => setTimeout(r, 500));
    await warmup.startMany(farmsMade.slice(0, 2));
    const oneByOne = warmup.overview();
    const queued = { atOnce: oneByOne.atOnce, running: oneByOne.running.length, waiting: oneByOne.waiting.length, saved: warmup.settings().parallel, second: warmup.status(farmsMade[1].id), text: "" };
    for (let i = 0; i < 20 && !/Waiting their turn/.test(queued.text); i++) {
      await new Promise((r) => setTimeout(r, 50));
      queued.text = await tab.webContents.executeJavaScript("document.getElementById('warmupallhint').textContent");
    }
    warmup.stopAll();
    warmup.saveSettings({ parallel: 0 });
    browser.close(tab);
    const all = global.noorTest.context.profiles.all();
    const made = all.filter((p) => /^Farm \d+$/.test(p.name));
    const farms = [];
    for (const profile of made) {
      const got = await electron.session.fromPartition(browser.partitionFor(false, profile)).cookies.get({});
      const value = (name) => { const c = got.find((x) => x.name === name); return c ? decodeURIComponent(c.value) : null; };
      farms.push({ name: profile.name, status: firstRun.get(profile.id), ua: value("ua_b"), screen: value("screen_b"), mine: global.noorTest.shownOf(profile.id) });
    }
    const own = await global.noorTest.cookies.list(inUse);
    return { added: all.length - before, names: made.map((p) => p.name), listed, stayed: browser.profile.id === inUse.id, inUseClean: !own.sites.some((s) => s.site === "warm-b.test"), select, waited, most, hint, toasts: [...toasts].filter(Boolean), queued, farms };
  }, [`http://warm-b.test:${port}/`]);
  // A profile's collection goes on when another profile is opened (in its
  // own window, in front).
  const switching = await main(async (electron, sites) => {
    const browser = global.noorTest.browser;
    const warmup = global.noorTest.warmup;
    warmup.saveSettings({ mode: "mine", sites: sites.join("\n"), auto: false });
    const home = browser.profile;
    const other = global.noorTest.context.profiles.all().find((p) => p.id !== home.id);
    await warmup.start();
    global.noorTest.windows.open(other);
    const right = { status: warmup.status(home.id), inUse: global.noorTest.windows.current.profile.id === other.id };
    for (let i = 0; i < 600 && warmup.running; i++) await new Promise((r) => setTimeout(r, 100));
    const listed = await global.noorTest.cookies.list(home);
    return { right, status: warmup.status(home.id), sites: listed.sites.map((s) => s.site) };
  }, [`http://warm-a.test:${port}/mine-switch`, `http://warm-c.test:${port}/mine-switch`]);
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
    check(`${site}: the page shown, with the profile's protection`, cookie(site, "vis") === "visible" && cookie(site, "webdriver") === "false" && (build === "iphone" ? /iPhone/.test(cookie(site, "ua")) : build === "android" ? /Android 10; K.*Chrome\//.test(cookie(site, "ua")) : /Windows NT.*Chrome\//.test(cookie(site, "ua"))), { vis: cookie(site, "vis"), ua: cookie(site, "ua"), webdriver: cookie(site, "webdriver") });
  }
  const never = hits.filter((h) => / \/(logout|account|files|popup|elsewhere)/.test(h));
  check("no sign-out, account, file, window or other site", never.length === 0, never);
  check("no tab, window, history or hidden tab left", after.tabs === before.tabs && after.backgroundTabs === 0 && after.history.length === before.history && after.windows === 1, { before, after: { tabs: after.tabs, backgroundTabs: after.backgroundTabs, history: after.history, windows: after.windows } });
  check("what was under way was told", SITES.every((site) => seen.includes(`warm-${site}.test`)), seen);
  check("stopped halfway: at once, and said", stopped.right.running === false && stopped.right.hidden === 0 && stopped.after.stopped === true && stopped.after.finished === true, stopped);
  check("the settings show the profile's cookies", /This profile has \d+ cookies? from \d+ sites?|Stopped: /.test(settings.text) && / \| Collect$/.test(settings.text), settings.text);
  console.log("settings:", settings.text, "screenshot:", path.join(userData, "settings.png"));
  check("my sites, saved: those visited and only those", mine.started.mine === true && mine.started.total === 1 && mine.status.done === 1 && mine.status.failed === 0 && mine.settings.mode === "mine" && mine.cookies.includes("warm-b.test mine_b") && hits.some((h) => h.startsWith("b /mine-page")), { started: mine.started, settings: mine.settings });
  check("the settings page shows them saved", form.mode === "mine" && form.sites.includes(`warm-b.test:${port}/mine-page`) && form.countHidden === true && /^Saved: your 1 site\./.test(form.saved), form);
  check("a new profile collects by itself", auto.began && auto.status.profileId === auto.profileId && auto.status.done === 1 && auto.sites.some((s) => s.startsWith("warm-c.test:")), auto);
  check("the Cookies page lists the profile's cookies by site", viewer.shown.profile === "Auto" && viewer.shown.sites.includes("warm-c.test") && viewer.shown.summary === "1 cookie from 1 site." && viewer.rows === 2, { shown: viewer.shown, rows: viewer.rows });
  check("a site's cookies taken away, and all saved as cookies.txt", viewer.exported && viewer.removed === 1 && viewer.left === 0, { exported: viewer.exported, removed: viewer.removed, left: viewer.left });
  console.log("cookies page screenshot:", path.join(userData, "cookies.png"));
  check("several profiles at once, from the settings; the profile in use stays and keeps its cookies", many.added === 3 && many.names.join() === "Farm 1,Farm 2,Farm 3" && many.names.every((name) => many.listed.includes(name)) && many.stayed && many.inUseClean, { added: many.added, names: many.names, stayed: many.stayed, inUseClean: many.inUseClean });
  check("the new profiles all collect at the same time, in the background", !many.waited && many.most === 3 && many.select.value === "0" && /^All \(up to \d+\)$/.test(many.select.label) && many.hint !== "" && many.farms.every((f) => f.status.finished && f.status.done === 1), { waited: many.waited, most: many.most, select: many.select, hint: many.hint, farms: many.farms.map((f) => f.status) });
  check("one toast for the profiles that start together", many.toasts.some((t) => t === "Collecting cookies in 3 profiles at once…") && !many.toasts.some((t) => /^Collecting cookies in “Farm/.test(t)), many.toasts);
  check("one at a time when chosen: the others wait their turn", many.queued.saved === 1 && many.queued.atOnce === 1 && many.queued.running === 1 && many.queued.waiting === 1 && many.queued.second.waiting && many.queued.second.position === 1 && /Waiting their turn \(1 at a time\): Farm/.test(many.queued.text), many.queued);
  check("a profile collecting in the background shows its own fingerprints", many.farms.every((f) => f.ua === f.mine.userAgent && f.screen === f.mine.screen), many.farms.map((f) => ({ name: f.name, ua: f.ua, screen: f.screen, mine: f.mine })));
  check("a profile's collection goes on when another profile is opened", switching.right.inUse && switching.right.status.running && !switching.status.stopped && switching.status.finished && switching.status.done === 2 && switching.sites.includes("warm-a.test") && switching.sites.includes("warm-c.test"), switching);
  console.log(JSON.stringify({ build, status, hits: hits.length, failures }, null, 2));
  process.exit(failures.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
