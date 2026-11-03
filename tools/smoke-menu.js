// Runs Noor's menus, drawn as Chrome's (renderer/menu.html): the ⋯ menu
// opens under its button with an icon by each item and its shortcuts; its
// zoom row zooms and stays open; a submenu opens beside its item; an item
// chosen runs and closes the menu; Escape and a click outside close it; the
// profile's and the shields' menus too. Screenshots of each for a look.
// With "iphone", in Noor iPhone. Needs Playwright and a display: on Linux,
// `xvfb-run -a node tools/smoke-menu.js [iphone]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const iphone = process.argv[2] === "iphone";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end("<!doctype html><title>A page</title><p>A page.</p>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://menu.test:${server.address().port}/`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-menu-"));
  const app = await electron.launch({
    executablePath: require(path.join(root, "node_modules", "electron")),
    args: [root, "--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1"],
    env: { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: userData, NOOR_DEVICE: iphone ? "iphone" : "windows", NOOR_TEST_TIMEZONE: "Africa/Casablanca" },
  });
  app.process().stderr.on("data", (data) => { if (process.env.SMOKE_VERBOSE) process.stderr.write("[electron] " + data); });
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  await sleep(1500);
  const failures = [];
  const check = (name, ok, detail) => {
    if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`);
  };
  /// Runs `code` in the menu's page.
  const inMenu = (code) => main((electron, source) => global.noorTest.browser.overlay.webContents.executeJavaScript(source, true), code);
  const shot = async (name) => {
    const data = await main(async () => (await global.noorTest.browser.overlay.webContents.capturePage()).toPNG().toString("base64"));
    fs.writeFileSync(path.join(userData, `${name}.png`), Buffer.from(data, "base64"));
  };
  const clickIn = (selector) => inMenu(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})]; return el; })()`);
  void clickIn;

  // A page in the tab, for the zoom, the print and the shields.
  await main((electron, url) => { global.noorTest.browser.newTab({ url }); }, base);
  await sleep(1500);

  // The ⋯ menu, from its button.
  await main(() => global.noorTest.browser.chrome.webContents.executeJavaScript("document.getElementById('more').click()"));
  await sleep(1200);
  const more = await inMenu(`(() => {
    const panel = document.querySelector('.panel.main');
    const r = panel.getBoundingClientRect();
    const labels = [...panel.querySelectorAll('.item .label')].map((e) => e.textContent);
    return {
      labels,
      icons: panel.querySelectorAll('.item .icon svg').length,
      shortcuts: [...panel.querySelectorAll('.shortcut')].map((e) => e.textContent),
      profile: (() => { const p = panel.querySelector('.profilerow'); return p ? { name: p.querySelector('.label').textContent, avatar: p.querySelector('.avatar').textContent } : null; })(),
      zoom: (panel.querySelector('.zoomvalue') || {}).textContent,
      rect: { left: r.left, top: r.top, right: r.right, width: r.width },
      width: innerWidth,
    };
  })()`);
  const shown = await main(() => ({ shown: global.noorTest.browser.menuShown, tabs: global.noorTest.browser.tabs.length }));
  check("the ⋯ menu opens, drawn, under its button on the right", shown.shown && more.rect.right > more.width - 80 && more.rect.top > 30 && more.rect.top < 140, { shown, rect: more.rect, width: more.width });
  check("each item with its icon, as Chrome's", more.labels.includes("New tab") && more.labels.includes("Settings") && more.labels.includes("Exit") && more.icons >= 14, { labels: more.labels, icons: more.icons });
  check("shortcuts on the right", ["Ctrl+T", "Ctrl+Shift+N", "Ctrl+H", "Ctrl+F", "Ctrl+P", "Ctrl+,"].every((key) => more.shortcuts.includes(key)), more.shortcuts);
  check("the profile row: its name and initial", more.profile && more.profile.name === "Personal" && more.profile.avatar === "P", more.profile);
  check("the zoom row", more.zoom === "100%", more.zoom);
  await shot("menu-more");

  // Zooming from the menu: the menu stays, with the new zoom.
  await inMenu("document.querySelector('.zoomgroup .round[title=\"Zoom in\"]').click()");
  await sleep(600);
  const zoomed = await inMenu("({ value: document.querySelector('.zoomvalue').textContent, open: Boolean(document.querySelector('.panel.main')) })");
  const factor = await main(() => global.noorTest.browser.selected.webContents.getZoomFactor());
  check("zoom in: the page zooms and the menu stays, saying so", zoomed.value === "110%" && Math.abs(factor - 1.1) < 0.01 && await main(() => global.noorTest.browser.menuShown), { zoomed, factor });
  await inMenu("document.querySelector('.zoomgroup .round[title=\"Zoom out\"]').click()");
  await sleep(500);

  // A submenu beside its item.
  await inMenu("[...document.querySelectorAll('.panel.main .item')].find((e) => e.textContent.includes('Cookies')).click()");
  await sleep(500);
  const cookies = await inMenu(`(() => {
    const sub = document.querySelector('.panel.sub');
    const main = document.querySelector('.panel.main').getBoundingClientRect();
    return sub ? { labels: [...sub.querySelectorAll('.label')].map((e) => e.textContent), left: sub.getBoundingClientRect().right <= main.left + 4, icons: sub.querySelectorAll('svg').length } : null;
  })()`);
  check("a submenu opens beside its item, on the left", cookies && cookies.labels.join() === "Copy cookies of this page,Paste cookies into this page…,Collect cookies…,See cookies" && cookies.left && cookies.icons >= 4, cookies);
  await shot("menu-cookies");

  // The profile's submenu: every profile with its initial on its color.
  await main(() => global.noorTest.context.profiles.addMany(2));
  await main(() => global.noorTest.browser.chrome.webContents.executeJavaScript("document.getElementById('more').click()"));
  await sleep(300);
  await main(() => global.noorTest.browser.chrome.webContents.executeJavaScript("document.getElementById('more').click()"));
  await sleep(800);
  await inMenu("document.querySelector('.profilerow').click()");
  await sleep(500);
  const profiles = await inMenu(`[...document.querySelectorAll('.panel.sub .item')].map((e) => ({ label: (e.querySelector('.label') || {}).textContent, avatar: (e.querySelector('.avatar') || {}).textContent || '', color: e.querySelector('.avatar') ? e.querySelector('.avatar').style.background : '', tick: Boolean(e.querySelector('.tick')) }))`);
  check("the profiles, each its initial on its color, this window's ticked", profiles.length >= 6 && profiles[0].label === "Personal" && profiles[0].tick && profiles[1].avatar === "2" && profiles[1].color && profiles[1].color !== profiles[0].color, profiles);
  await shot("menu-profiles");

  // An item chosen: it runs, and the menu closes.
  await inMenu("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
  await sleep(200);
  await inMenu("[...document.querySelectorAll('.panel.main .item')].find((e) => e.textContent.includes('New tab')).click()");
  await sleep(800);
  const chosen = await main(() => ({ shown: global.noorTest.browser.menuShown, tabs: global.noorTest.browser.tabs.length }));
  check("an item chosen runs and closes the menu", !chosen.shown && chosen.tabs === shown.tabs + 1, { before: shown, after: chosen });

  // Escape, and a click outside, close it.
  await main(() => global.noorTest.browser.chrome.webContents.executeJavaScript("document.getElementById('more').click()"));
  await sleep(800);
  await inMenu("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
  await sleep(400);
  const escaped = await main(() => global.noorTest.browser.menuShown);
  await main(() => global.noorTest.browser.chrome.webContents.executeJavaScript("document.getElementById('more').click()"));
  await sleep(800);
  await inMenu("document.getElementById('layer').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))");
  await sleep(400);
  const outside = await main(() => global.noorTest.browser.menuShown);
  check("Escape and a click outside close it", !escaped && !outside, { escaped, outside });

  // Night mode: a switch, the menu stays.
  await main(() => global.noorTest.browser.chrome.webContents.executeJavaScript("document.getElementById('more').click()"));
  await sleep(800);
  await inMenu("document.querySelector('.item.toggle').click()");
  await sleep(500);
  const night = await inMenu("({ on: document.querySelector('.item.toggle .switch').classList.contains('on') })");
  const nightSaved = await main(() => global.noorTest.context.store.get("nightMode"));
  check("night mode switched on from its row, the menu staying", night.on && nightSaved === true, { night, nightSaved });
  await inMenu("document.querySelector('.item.toggle').click()");
  await sleep(300);
  await inMenu("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
  await sleep(300);

  // The profile button's menu, and the shields'.
  await main(() => global.noorTest.browser.select(global.noorTest.browser.tabs.find((t) => /menu\.test/.test(t.url))));
  await sleep(300);
  await main(() => global.noorTest.browser.chrome.webContents.executeJavaScript("document.getElementById('profile').click()"));
  await sleep(800);
  const profileMenu = await inMenu("({ title: (document.querySelector('.header .title') || {}).textContent, items: document.querySelectorAll('.panel.main .item').length })");
  check("the profile button's menu: this window's profile, then every profile", profileMenu.title === "Personal" && profileMenu.items >= 6, profileMenu);
  await shot("menu-profile-button");
  await inMenu("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
  await sleep(300);
  await main(() => global.noorTest.browser.chrome.webContents.executeJavaScript("document.getElementById('shields').click()"));
  await sleep(800);
  const shieldsMenu = await inMenu("({ title: (document.querySelector('.header .title') || {}).textContent, toggle: Boolean(document.querySelector('.item.toggle .switch.on')) })");
  check("the shields' menu: the site's shields, on", /^Shields are up for menu\.test/.test(shieldsMenu.title || "") && shieldsMenu.toggle, shieldsMenu);
  await shot("menu-shields");

  await inMenu("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
  await sleep(300);

  // The settings, laid out as Chrome's: the sections with their icons on
  // the left, a search through every setting.
  const settings = await main(async () => {
    const browser = global.noorTest.browser;
    const tab = browser.newTab({ url: "noor://app/settings.html" });
    await new Promise((r) => setTimeout(r, 2000));
    const run = (code) => tab.webContents.executeJavaScript(code, true);
    const layout = await run(`({
      links: [...document.querySelectorAll('.sidebar a')].map((a) => ({ text: a.textContent.trim(), icon: Boolean(a.querySelector('svg')) })),
      headings: [...document.querySelectorAll('.settingspage h3')].map((h) => ({ text: h.textContent.trim(), icon: Boolean(h.querySelector('svg')) })),
      active: (document.querySelector('.sidebar a.active') || {}).textContent,
    })`);
    const shot = (await tab.webContents.capturePage()).toPNG().toString("base64");
    await run("{ const s = document.getElementById('settingsearch'); s.value = 'night'; s.dispatchEvent(new Event('input')); }");
    await new Promise((r) => setTimeout(r, 200));
    const night = await run(`({
      rows: [...document.querySelectorAll('.settingspage .row')].filter((r) => r.offsetParent).map((r) => r.querySelector('.label') ? r.querySelector('.label').firstChild.textContent.trim() : r.textContent.trim()),
      headings: [...document.querySelectorAll('.settingspage h3')].filter((h) => h.offsetParent).map((h) => h.textContent.trim()),
      nomatch: !document.getElementById('nomatch').hidden,
    })`);
    const searchShot = (await tab.webContents.capturePage()).toPNG().toString("base64");
    await run("{ const s = document.getElementById('settingsearch'); s.value = 'qqqzzz'; s.dispatchEvent(new Event('input')); }");
    await new Promise((r) => setTimeout(r, 200));
    const nothing = await run("!document.getElementById('nomatch').hidden && [...document.querySelectorAll('.settingspage .row')].every((r) => !r.offsetParent)");
    await run("{ const s = document.getElementById('settingsearch'); s.value = ''; s.dispatchEvent(new Event('input')); }");
    await run("document.querySelector('.sidebar a[href=\"#about\"]').click()");
    // The smooth scroll down the page (a long one in Noor iPhone's narrow
    // window) takes a while: until it stops.
    for (let i = 0, last = -1, still = 0; i < 60 && still < 4; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const y = await run("scrollY");
      still = y === last ? still + 1 : 0;
      last = y;
    }
    const about = await run("(document.querySelector('.sidebar a.active') || {}).textContent");
    // On and off as switches, as Chrome's: one clicked turns its setting
    // over, and back.
    await run("document.querySelector('.sidebar a[href=\"#shields\"]').click()");
    await new Promise((r) => setTimeout(r, 1200));
    const switchShot = (await tab.webContents.capturePage()).toPNG().toString("base64");
    const box = "document.querySelector('input[data-setting=\"cleanLinks\"]')";
    const before = await run(`({ checked: ${box}.checked, look: getComputedStyle(${box}).appearance, width: ${box}.offsetWidth })`);
    await run(`${box}.click()`);
    await new Promise((r) => setTimeout(r, 400));
    const after = await run(`${box}.checked`);
    await run(`${box}.click()`);
    await new Promise((r) => setTimeout(r, 400));
    const back = await run(`${box}.checked`);
    browser.close(tab);
    return { layout, night, nothing, about, shot, searchShot, switchShot, switches: { before, after, back } };
  });
  fs.writeFileSync(path.join(userData, "settings.png"), Buffer.from(settings.shot, "base64"));
  fs.writeFileSync(path.join(userData, "settings-search.png"), Buffer.from(settings.searchShot, "base64"));
  fs.writeFileSync(path.join(userData, "settings-switches.png"), Buffer.from(settings.switchShot, "base64"));
  check("the settings' sections on the left, each with its icon", settings.layout.links.length === 7 && settings.layout.links.every((l) => l.icon) && settings.layout.headings.length === 7 && settings.layout.headings.every((h) => h.icon) && settings.layout.active === "Profiles", settings.layout);
  check("searching the settings: only the rows that match, with their section", settings.night.rows.join() === "Night mode" && settings.night.headings.join() === "General" && !settings.night.nomatch, settings.night);
  check("nothing found: it says so", settings.nothing, settings.nothing);
  check("a section from the sidebar: shown, and marked", settings.about === "About Noor", settings.about);
  const flips = settings.switches;
  check("a setting's switch: drawn as a switch, turns it over and back", flips.before.look === "none" && flips.before.width === 36 && flips.after === !flips.before.checked && flips.back === flips.before.checked, flips);

  await app.close();
  server.close();
  console.log(JSON.stringify({ iphone, screenshots: userData, failures }, null, 2));
  process.exit(failures.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
