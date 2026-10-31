// Runs Noor with profiles in windows of their own (main/windows.js): a
// profile opens in a window of its own (opened again, its window comes to
// the front), with its title, its icon (its name on its color) and its
// taskbar button, its own tabs and cookies; a hidden tab collecting cookies
// goes on when the window it is in closes; with "Replace a profile when
// closed", a profile's window closing deletes it and makes a new one of the
// same name in its place (never the first profile), which collects its
// cookies, at the next launch if the app was quitting; deleting a profile
// closes its window; the windows open as the app quit open again, Noor
// started with --profile=<id> opens that one, and so does Noor started
// again while it runs (a pinned profile's button). With "iphone", in Noor
// iPhone. Needs Playwright and a display: on Linux,
// `xvfb-run -a node tools/smoke-windows.js [iphone]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const iphone = process.argv[2] === "iphone";
const product = iphone ? "Noor iPhone" : "Noor";
const appId = iphone ? "ma.noor.iphone" : "ma.noor.browser";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("cache-control", "no-store");
    if (/^\/(set|warm)/.test(req.url)) {
      res.setHeader("set-cookie", `seen=${encodeURIComponent(req.url)}; Path=/; Max-Age=86400`);
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Page ${req.url}</title><p>${req.url}</p><div style="height:2000px"></div>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const base = `http://win.test:${port}`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-windows-"));
  const env = {
    ...process.env,
    NOOR_TEST: "1",
    NOOR_USER_DATA: userData,
    NOOR_DEVICE: iphone ? "iphone" : "windows",
    NOOR_TEST_TIMEZONE: "Africa/Casablanca",
    NOOR_TEST_WARMUP_SITES: JSON.stringify([`${base}/warm-a`, `${base}/warm-b`]),
    NOOR_TEST_WARMUP_FAST: "1",
    NOOR_TEST_WARMUP_FOLLOW: "0",
  };
  const electronPath = require(path.join(root, "node_modules", "electron"));
  const args = [root, "--no-sandbox", "--host-resolver-rules=MAP *.test 127.0.0.1"];

  const launch = async (extra = []) => {
    const app = await electron.launch({ executablePath: electronPath, args: args.concat(extra), env });
    app.process().stderr.on("data", (data) => { if (process.env.SMOKE_VERBOSE) process.stderr.write("[electron] " + data); });
    const main = (fn, arg) => app.evaluate(fn, arg);
    for (let i = 0; i < 200; i++) {
      if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
      await sleep(100);
    }
    await sleep(1200);
    return { app, main };
  };
  /// Waits in the app until `fn` (given `arg`) is true, `ms` at most.
  const until = (main, fn, arg, ms = 10000) => main(async (electron, [source, value, wait]) => {
    const check = new Function("value", `return (${source})(value)`);
    for (let i = 0; i < wait / 50; i++) {
      if (await check(value)) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }, [fn.toString(), arg, ms]);

  const failures = [];
  const check = (name, ok, detail) => {
    if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`);
  };

  // MARK: - A first run
  let { app, main } = await launch();
  const first = await main(() => {
    const w = global.noorTest.windows;
    return { count: w.list.length, title: w.current.win.getTitle(), taskbar: w.current.taskbar, profile: w.current.profile.id, visible: w.current.win.isVisible() };
  });
  check("one window at first, the first profile's, as Noor", first.count === 1 && first.title === product && first.profile === "default" && first.visible && first.taskbar.appId === appId, first);

  // A new profile from the settings page: a window of its own, as big as
  // the screen in Noor (a window manager does it; the test's display has
  // none, so the request is what is seen).
  const made = await main(async (electron) => {
    const maximize = electron.BaseWindow.prototype.maximize;
    global.maximized = [];
    electron.BaseWindow.prototype.maximize = function () {
      global.maximized.push(this.id);
      return maximize.call(this);
    };
    const w = global.noorTest.windows;
    const home = w.current;
    const tab = home.newTab({ url: "noor://app/settings.html" });
    await new Promise((r) => setTimeout(r, 1500));
    await tab.webContents.executeJavaScript('noor.invoke("profiles:create", "Shop 7")');
    for (let i = 0; i < 100 && w.list.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
    const shop = w.current;
    await shop.dressing;
    for (let i = 0; i < 100 && !shop.win.isVisible(); i++) await new Promise((r) => setTimeout(r, 50));
    const icon = shop.icon;
    const png = icon ? electron.nativeImage.createFromPath(icon.png) : null;
    home.close(tab);
    return {
      count: w.list.length,
      title: shop.win.getTitle(),
      profile: shop.profile.name,
      id: shop.profile.id,
      inFront: w.current === shop,
      visible: shop.win.isVisible() && home.win.isVisible(),
      maximized: global.maximized.includes(shop.win.id),
      onScreen: (() => {
        const area = electron.screen.getDisplayMatching(shop.win.getNormalBounds()).workArea;
        const b = shop.win.getNormalBounds();
        return b.x >= area.x && b.y >= area.y && b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height;
      })(),
      taskbar: shop.taskbar,
      png: png ? png.getSize() : null,
      icon,
      tabs: shop.tabs.length,
      state: shop.state().profile,
    };
  });
  const ico = made.icon ? fs.readFileSync(made.icon.ico) : null;
  made.ico = ico ? { reserved: ico.readUInt16LE(0), type: ico.readUInt16LE(2), count: ico.readUInt16LE(4) } : null;
  check("a new profile opens in a window of its own, in front, shown with the other", made.count === 2 && made.title === `Shop 7 - ${product}` && made.profile === "Shop 7" && made.inFront && made.visible && made.tabs === 1, made);
  check(iphone ? "Noor iPhone's window: as big as its iPhone, on the screen" : "Noor's window: as big as the screen", (iphone ? !made.maximized : made.maximized) && made.onScreen, { maximized: made.maximized, onScreen: made.onScreen });
  check("its own icon (an .ico of 8 sizes, 256 the biggest) and its own taskbar button", made.ico && made.ico.reserved === 0 && made.ico.type === 1 && made.ico.count === 8 && made.png && made.png.width === 256 && made.taskbar.appId === `${appId}.profile.${made.id.replace(/-/g, "")}` && made.taskbar.appIconPath && made.taskbar.appIconPath.endsWith(".ico"), { ico: made.ico, png: made.png, taskbar: made.taskbar });
  check("the toolbar shows the profile in its color", made.state.name === "Shop 7" && /^#[0-9a-f]{6}$/.test(made.state.color || ""), made.state);
  if (made.icon) fs.copyFileSync(made.icon.png, path.join(userData, "shop-7-icon.png"));

  // Each window its own tabs and cookies.
  const apart = await main(async (electron, base) => {
    const w = global.noorTest.windows;
    const [home, shop] = w.list;
    const load = async (b, url) => {
      const tab = b.newTab({ url });
      for (let i = 0; i < 100 && (tab.webContents.isLoading() || tab.webContents.getURL() !== url); i++) await new Promise((r) => setTimeout(r, 50));
      await new Promise((r) => setTimeout(r, 300));
      return tab;
    };
    await load(shop, base + "/set-shop");
    const plain = await load(home, base + "/plain");
    const homeCookie = await plain.webContents.executeJavaScript("document.cookie");
    const shopCookies = await electron.session.fromPartition(w.partitionFor(false, shop.profile)).cookies.get({});
    return { homeCookie, shopCookies: shopCookies.map((c) => `${c.name}=${decodeURIComponent(c.value)}`), homeTabs: home.tabs.length, shopTabs: shop.tabs.length, homeProfile: home.state().profile.name, shopProfile: shop.state().profile.name };
  }, base);
  check("each window its own tabs, profile and cookies", apart.homeCookie === "" && apart.shopCookies.includes("seen=/set-shop") && apart.homeTabs === 2 && apart.shopTabs === 2 && apart.homeProfile === "Personal" && apart.shopProfile === "Shop 7", apart);

  // An open profile, opened again: its window comes to the front.
  const again = await main(async () => {
    const w = global.noorTest.windows;
    const shop = w.list[1];
    const tab = shop.newTab({ url: "noor://app/settings.html" });
    await new Promise((r) => setTimeout(r, 1500));
    const rows = await tab.webContents.executeJavaScript("[...document.querySelectorAll('#profiles .row')].map((r) => r.textContent)");
    await tab.webContents.executeJavaScript('noor.invoke("profiles:open", "default")');
    await new Promise((r) => setTimeout(r, 300));
    shop.close(tab);
    return { count: w.list.length, front: w.current.profile.id, rows };
  });
  check("an open profile opened again: its window to the front, no new one", again.count === 2 && again.front === "default", again);
  check("the settings list each profile, this window's and the others open", again.rows.some((r) => /^✓ Shop 7/.test(r) && /This window/.test(r)) && again.rows.some((r) => /^Personal/.test(r) && /Show/.test(r) && /Open in another window/.test(r)), again.rows);

  // A hidden tab collecting cookies goes on when its window closes.
  const carried = await main(async (electron) => {
    const w = global.noorTest.windows;
    const warmup = global.noorTest.warmup;
    const [home, shop] = w.list;
    w.open(shop.profile);
    const [farm] = w.createProfiles(1, "Farm");
    await warmup.start(null, farm);
    const hostBefore = shop.backgroundTabs.length;
    shop.win.close();
    for (let i = 0; i < 100 && w.list.length > 1; i++) await new Promise((r) => setTimeout(r, 50));
    const moved = home.backgroundTabs.length;
    for (let i = 0; i < 400 && warmup.status(farm.id).running; i++) await new Promise((r) => setTimeout(r, 100));
    const cookies = await electron.session.fromPartition(w.partitionFor(false, farm)).cookies.get({});
    return { hostBefore, moved, count: w.list.length, status: warmup.status(farm.id), cookies: cookies.length, shopKept: Boolean(global.noorTest.context.profiles.find(shop.profile.id)), left: home.backgroundTabs.length };
  });
  check("a hidden tab collecting goes on in another window when its window closes", carried.hostBefore === 1 && carried.moved === 1 && carried.count === 1 && carried.status.finished && !carried.status.stopped && carried.status.done === 2 && carried.cookies >= 1 && carried.left === 0, carried);
  check("a closed profile stays, unless it is to be replaced", carried.shopKept, carried);

  // "Replace a profile when closed".
  const replaced = await main(async (electron) => {
    const w = global.noorTest.windows;
    const context = global.noorTest.context;
    const home = w.list[0];
    const tab = home.newTab({ url: "noor://app/settings.html" });
    await new Promise((r) => setTimeout(r, 1500));
    await tab.webContents.executeJavaScript("const box = document.getElementById('freshonclose'); box.checked = true; box.dispatchEvent(new Event('change'));");
    await new Promise((r) => setTimeout(r, 400));
    const checked = await tab.webContents.executeJavaScript("document.getElementById('freshonclose').checked");
    home.close(tab);
    const before = context.profiles.all();
    const old = before.find((p) => p.name === "Shop 7");
    const shop = w.open(old);
    await new Promise((r) => setTimeout(r, 800));
    shop.win.close();
    for (let i = 0; i < 100 && context.profiles.find(old.id); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    const after = context.profiles.all();
    const fresh = after[after.length - 1];
    const cookies = await electron.session.fromPartition(w.partitionFor(false, fresh)).cookies.get({});
    return {
      checked, saved: context.store.get("freshOnClose"),
      names: [before.map((p) => p.name), after.map((p) => p.name)],
      fresh: { name: fresh.name, id: fresh.id, old: old.id, cookies: cookies.length },
      oldGone: !context.profiles.find(old.id),
      doomed: (context.store.get("doomedPartitions") || []).includes(`noor-${old.id}`),
      windows: w.list.length,
    };
  });
  check("the setting is on, from the settings page", replaced.checked && replaced.saved === true, replaced);
  check("a profile's window closed: deleted, a new one with the next number last, with nothing of the old one", replaced.oldGone && replaced.doomed && replaced.fresh.name === "Shop 8" && replaced.fresh.id !== replaced.fresh.old && replaced.fresh.cookies === 0 && !replaced.names[1].includes("Shop 7") && replaced.names[1].length === replaced.names[0].length && replaced.windows === 1, replaced);

  // The first profile is never replaced; deleting a profile closes its window.
  const kept = await main(async () => {
    const w = global.noorTest.windows;
    const context = global.noorTest.context;
    const shop = w.open(context.profiles.all().find((p) => /^Shop \d+$/.test(p.name)));
    await new Promise((r) => setTimeout(r, 800));
    w.forProfile("default").win.close();
    for (let i = 0; i < 100 && w.list.length > 1; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    const firstKept = context.profiles.all()[0].id === "default" && context.profiles.all()[0].name === "Personal";
    const gone = w.createProfile("Gone 1");
    await new Promise((r) => setTimeout(r, 800));
    const opened = w.list.length;
    await w.deleteProfile(gone.id);
    for (let i = 0; i < 100 && w.list.length > 1; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    return { firstKept, opened, after: w.list.length, names: context.profiles.all().map((p) => p.name), front: w.current === shop };
  });
  check("the first profile is never replaced", kept.firstKept, kept);
  check("deleting a profile closes its window, with none in its place", kept.opened === 2 && kept.after === 1 && !kept.names.includes("Gone 1") && kept.front, kept);

  // The windows open as the app quits open again; replaced ones collect then.
  const ids = await main(async () => {
    const w = global.noorTest.windows;
    const context = global.noorTest.context;
    context.store.set("freshOnClose", false);
    w.open(context.profiles.find("default"));
    await new Promise((r) => setTimeout(r, 800));
    return { shop: context.profiles.all().find((p) => /^Shop \d+$/.test(p.name)).id, open: w.list.map((x) => x.profile.id), last: context.profiles.current().id };
  });
  await app.close();
  ({ app, main } = await launch());
  await until(main, () => global.noorTest.windows.list.every((x) => x.win.isVisible()), null, 10000);
  await sleep(1000);
  const restored = await main(() => ({ open: global.noorTest.windows.list.map((x) => x.profile.id), front: global.noorTest.windows.current.profile.id }));
  check("the windows open as the app quit open again, the one used last in front", JSON.stringify(restored.open.slice().sort()) === JSON.stringify(ids.open.slice().sort()) && restored.front === ids.last, { restored, before: ids });

  // Noor started again while it runs (a pinned profile's button): that
  // profile's window, in front.
  const shopWindow = await main((electron, id) => {
    const w = global.noorTest.windows;
    const shop = w.forProfile(id);
    shop.win.close();
    return w.list.length;
  }, ids.shop);
  await sleep(500);
  const second = spawn(electronPath, args.concat([`--profile=${ids.shop}`]), { env, stdio: "ignore" });
  await new Promise((resolve) => { second.on("exit", resolve); setTimeout(resolve, 15000); });
  await until(main, (id) => Boolean(global.noorTest.windows.forProfile(id)), ids.shop, 8000);
  const relaunched = await main((electron, id) => ({ count: global.noorTest.windows.list.length, front: global.noorTest.windows.current.profile.id === id }), ids.shop);
  check("Noor started again with a profile: its window opens, in front", shopWindow === 1 && relaunched.count === 2 && relaunched.front, { shopWindow, relaunched });

  // Quitting with "Replace a profile when closed" and new profiles
  // collecting: the profile is made new, and collects at the next launch.
  const quitting = await main(async () => {
    const context = global.noorTest.context;
    context.store.set("freshOnClose", true);
    global.noorTest.warmup.saveSettings({ auto: true });
    const shop = context.profiles.all().find((p) => /^Shop \d+$/.test(p.name));
    return { id: shop.id, slot: context.profiles.slotOf(shop), appId: global.noorTest.windows.forProfile(shop.id).taskbar.appId };
  });
  await app.close();
  // As its pinned taskbar button starts it: the profile in its place.
  ({ app, main } = await launch([`--profile=${quitting.slot}`]));
  const pending = await main(async (electron, old) => {
    const context = global.noorTest.context;
    const w = global.noorTest.windows;
    const fresh = context.profiles.all().find((p) => /^Shop \d+$/.test(p.name));
    const warmup = global.noorTest.warmup;
    for (let i = 0; i < 100 && !warmup.status(fresh.id).running && !warmup.status(fresh.id).finished; i++) await new Promise((r) => setTimeout(r, 50));
    const status = warmup.status(fresh.id);
    const shown = w.forProfile(fresh.id);
    if (shown) await shown.dressing;
    return { fresh: fresh.id, old: old.id, gone: !context.profiles.find(old.id), collecting: status.running || status.finished, pending: context.store.get("collectPending"), open: w.list.map((x) => x.profile.name), appId: shown ? shown.taskbar.appId : null, slot: fresh.slot };
  }, quitting);
  check("quitting: the profile made new, collecting at the next launch", pending.gone && pending.fresh !== pending.old && pending.collecting && JSON.stringify(pending.pending) === "[]", pending);
  check("its pinned button (--profile=<its first id>) opens the profile in its place, the next number, the same taskbar button", pending.open.join() === "Shop 9" && pending.appId === quitting.appId && pending.slot === quitting.slot, { pending, quitting });

  // What the windows look like.
  const shot = await main(async () => {
    const w = global.noorTest.windows;
    const shop = w.open(global.noorTest.context.profiles.all().find((p) => /^Shop \d+$/.test(p.name)));
    for (let i = 0; i < 100 && !shop.win.isVisible(); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 800));
    return (await shop.chrome.webContents.capturePage()).toPNG().toString("base64");
  });
  fs.writeFileSync(path.join(userData, "toolbar.png"), Buffer.from(shot, "base64"));
  await app.close();
  server.close();
  console.log(JSON.stringify({ iphone, icon: path.join(userData, "shop-7-icon.png"), toolbar: path.join(userData, "toolbar.png"), failures }, null, 2));
  process.exit(failures.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
