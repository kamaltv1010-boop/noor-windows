"use strict";
// Extensions in the running app, end to end: one added from a folder (the
// sample in tools/sample-extension), from a .crx file, and from the Chrome
// Web Store (its page and download served here, as the store would), then
// updated as the store offers a new version; each runs in normal tabs (not
// private ones), shows its button in the toolbar (with its popup), its
// options page, and can be turned off and removed. A site's own service
// worker must find nothing of the extension system.
// Run: xvfb-run -a node tools/smoke-extensions.js
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { _electron: electron } = require("playwright");
const { zipOf, newKey, crx3 } = require("./make-crx");

const root = path.join(__dirname, "..");
const SAMPLE = path.join(__dirname, "sample-extension");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const PAGE = "<!doctype html><html><head><meta charset=utf-8><title>Ext</title></head><body>ext<script>navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then((reg) => { const ch = new MessageChannel(); ch.port1.onmessage = (e) => { window.swGlobals = e.data; }; reg.active.postMessage('x', [ch.port2]); });</script></body></html>";
  const SW = "self.addEventListener('install', () => self.skipWaiting()); self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim())); self.onmessage = (e) => e.ports[0].postMessage(Object.getOwnPropertyNames(self).filter((k) => /electron|chrome|crx/i.test(k)).join(',') || 'none');";
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", req.url === "/sw.js" ? "text/javascript" : "text/html");
    res.end(req.url === "/sw.js" ? SW : PAGE);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;

  // The store's extension: a .crx of the sample under another name, and a newer version with the same key.
  const storeKey = newKey();
  const manifest = JSON.parse(fs.readFileSync(path.join(SAMPLE, "manifest.json"), "utf8"));
  const storeManifest = (version) => JSON.stringify({ ...manifest, name: "__MSG_appName__", default_locale: "en", version });
  const messages = JSON.stringify({ appName: { message: "Store Sample" } });
  const v1 = crx3(zipOf(SAMPLE, { "manifest.json": storeManifest("2.0.0"), "_locales/en/messages.json": messages }), storeKey);
  const v2 = crx3(zipOf(SAMPLE, { "manifest.json": storeManifest("2.0.1"), "_locales/en/messages.json": messages }), storeKey);
  const fileCrx = crx3(zipOf(SAMPLE, { "manifest.json": JSON.stringify({ ...manifest, name: "File Sample", version: "3.0.0" }) }));
  const crxFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "noor-crx-")), "file-sample.crx");
  fs.writeFileSync(crxFile, fileCrx.data);

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-ext-"));
  const app = await electron.launch({
    executablePath: require(path.join(root, "node_modules", "electron")),
    args: [root, "--no-sandbox"],
    env: { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: userData, NOOR_TEST_RULES: JSON.stringify([{ domain: "127.0.0.1", allowedOn: ["127.0.0.1"] }]) },
  });
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) { if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected))) break; await sleep(100); }
  const results = {};
  const inTab = (code) => main((e, code) => global.noorTest.browser.selected.webContents.executeJavaScript(code, true), code);
  const inChrome = (code) => main((e, code) => global.noorTest.browser.chrome.webContents.executeJavaScript(code, true), code);
  const open = async (url, isPrivate = false) => { await main((e, [url, isPrivate]) => { global.noorTest.browser.newTab({ url, isPrivate }); }, [url, isPrivate]); await sleep(2000); };
  const marked = () => inTab("document.documentElement.dataset.noorSample || 'no'");
  const toolbarState = () => main(() => { const s = global.noorTest.browser.state(); return { extensionsHere: s.extensionsHere, storeExtension: s.storeExtension }; });

  // 1. From a folder.
  results.folderId = await main((e, dir) => global.noorTest.extensions.installFile(dir), SAMPLE);
  await open(base + "one");
  results.folderRuns = await marked();
  results.toolbar = await inChrome(`(async () => {
    await new Promise((r) => setTimeout(r, 800));
    const list = document.getElementById("actions");
    const buttons = list.shadowRoot ? [...list.shadowRoot.querySelectorAll("button")] : [];
    const background = buttons[0] ? buttons[0].style.backgroundImage : "";
    return { hidden: list.hidden, buttons: buttons.length, noIcon: buttons[0] ? buttons[0].classList.contains("no-icon") : null, icon: (background.match(/crx:[^"')]+/) || [""])[0] };
  })()`);
  // The icon the button shows, as the toolbar's session serves it.
  results.toolbar.iconServed = await main(async (electron, icon) => {
    if (!icon) return "none";
    const response = await electron.session.fromPartition("persist:noor-chrome").fetch(icon);
    return response.status + " " + response.headers.get("content-type");
  }, results.toolbar.icon);
  results.toolbar.shot = await main(async (e, file) => {
    const image = await global.noorTest.browser.chrome.webContents.capturePage();
    process.mainModule.require("fs").writeFileSync(file, image.toPNG());
    return file;
  }, path.join(os.tmpdir(), "noor-toolbar-extension.png"));
  await main(() => {
    for (const manager of global.noorTest.extensions.managers.values()) {
      manager.on("browser-action-popup-created", (popup) => { global.lastPopup = popup; });
    }
  });
  results.anchor = await inChrome("(() => { const list = document.getElementById('actions'); const b = list.shadowRoot && list.shadowRoot.querySelector('button'); if (!b) return null; const r = b.getBoundingClientRect(); b.click(); return { right: r.right, bottom: r.bottom }; })()");
  await sleep(1500);
  results.popup = await main((electron) => electron.BrowserWindow.getAllWindows().map((w) => w.webContents.getURL()).filter((u) => u.startsWith("chrome-extension://")));
  // Under its button, its right edge at the button's, inside the window and
  // the screen, once its page tells its size (Chromium tells it here as it
  // does on Windows; this display sends none for a hidden window).
  results.popupPlace = await main((electron, anchor) => {
    const popup = global.lastPopup;
    if (!popup || !popup.browserWindow) return null;
    popup.setSize({ width: 320, height: 240 });
    popup.updatePosition();
    const bounds = popup.browserWindow.getBounds();
    const win = global.noorTest.browser.win.getContentBounds();
    const area = electron.screen.getDisplayMatching(bounds).workArea;
    const place = {
      rightAtButton: Math.abs(bounds.x + bounds.width - (win.x + anchor.right)) <= 2,
      belowButton: bounds.y >= win.y + anchor.bottom,
      insideWindow: bounds.x >= win.x && bounds.x + bounds.width <= win.x + win.width,
      insideScreen: bounds.x >= area.x && bounds.y >= area.y && bounds.x + bounds.width <= area.x + area.width && bounds.y + bounds.height <= area.y + area.height,
      bounds,
    };
    // Put past the screen's edge, it comes back inside.
    popup.browserWindow.setBounds({ x: area.x + area.width - 40, y: bounds.y, width: 320, height: 240 });
    popup.emit("moved");
    const back = popup.browserWindow.getBounds();
    place.keptOnScreen = back.x + back.width <= area.x + area.width && back.x >= area.x;
    return place;
  }, results.anchor);
  await main((electron) => { for (const w of electron.BrowserWindow.getAllWindows()) if (w.webContents.getURL().startsWith("chrome-extension://")) w.close(); });
  results.siteServiceWorker = await inTab("new Promise((r) => { const t = setInterval(() => { if (window.swGlobals) { clearInterval(t); r(window.swGlobals); } }, 100); setTimeout(() => r('timeout'), 4000); })");

  // 2. Private tabs go without.
  await open(base + "private", true);
  results.privateRuns = await marked();
  results.privateToolbar = await toolbarState();
  results.privateActionsHidden = await inChrome("document.getElementById('actions').hidden");

  // 3. Its options page; off, on, removed.
  await open(`chrome-extension://${results.folderId}/options.html`);
  results.optionsTitle = await inTab("document.title");
  await main((e, id) => global.noorTest.extensions.setEnabled(id, false), results.folderId);
  await open(base + "two");
  results.whenOff = await marked();
  await main((e, id) => global.noorTest.extensions.setEnabled(id, true), results.folderId);
  await open(base + "three");
  results.whenOn = await marked();
  await main((e, id) => global.noorTest.extensions.remove(id), results.folderId);

  // 4. From a .crx file: it keeps its key's ID.
  results.crxId = await main((e, file) => global.noorTest.extensions.installFile(file), crxFile);
  results.crxIdExpected = fileCrx.id;
  await open(base + "four");
  results.crxRuns = await marked();
  await main((e, id) => global.noorTest.extensions.remove(id), results.crxId);

  // 5. From the store: its page and its download served here, the confirmation answered yes.
  await main(async (electron, { id, v1, v2, store }) => {
    const { session, net } = electron;
    const updateXML = (version, codebase) => `<?xml version="1.0" encoding="UTF-8"?><gupdate xmlns="http://www.google.com/update2/response" protocol="2.0"><app appid="${id}" status="ok"><updatecheck codebase="${codebase}" status="ok" version="${version}"/></app></gupdate>`;
    global.served = [];
    session.defaultSession.protocol.handle("https", (request) => {
      const url = new URL(request.url);
      if (url.host === "clients2.google.com" && url.searchParams.get("response") === "redirect") {
        global.served.push("download");
        return new Response(Buffer.from(v1, "base64"), { headers: { "content-type": "application/x-chrome-extension" } });
      }
      if (url.host === "clients2.google.com" && url.searchParams.get("response") === "updatecheck") {
        global.served.push("updatecheck");
        return new Response(updateXML("2.0.1", "https://clients2.googleusercontent.com/crx/blobs/test/store-sample.crx"), { headers: { "content-type": "text/xml" } });
      }
      if (url.host === "clients2.googleusercontent.com") {
        global.served.push("update");
        return new Response(Buffer.from(v2, "base64"));
      }
      return net.fetch(request, { bypassCustomProtocolHandlers: true });
    });
    const profileSession = session.fromPartition(global.noorTest.browser.partitionFor(false));
    profileSession.protocol.handle("https", (request) => {
      if (new URL(request.url).host === "chromewebstore.google.com") {
        return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Store Sample - Chrome Web Store</title></head><body>${store}</body></html>`, { headers: { "content-type": "text/html" } });
      }
      return net.fetch(request, { bypassCustomProtocolHandlers: true });
    });
    global.noorTest.extensions.confirm = async (name) => { global.confirmedName = name; return true; };
  }, { id: v1.id, v1: v1.data.toString("base64"), v2: v2.data.toString("base64"), store: "Store Sample" });
  await open(`https://chromewebstore.google.com/detail/store-sample/${v1.id}`);
  results.storeBefore = await toolbarState();
  results.storeButton = await inChrome("(() => { const b = document.getElementById('addextension'); return { hidden: b.hidden, label: b.textContent.trim() }; })()");
  await inChrome("document.getElementById('addextension').click()");
  for (let i = 0; i < 50; i++) { if (await main((e, id) => global.noorTest.extensions.isInstalled(id), v1.id)) break; await sleep(200); }
  await sleep(500);
  results.storeAfter = await toolbarState();
  results.storeButtonAfter = await inChrome("(() => { const b = document.getElementById('addextension'); return { hidden: b.hidden, disabled: b.disabled, label: b.textContent.trim() }; })()");
  results.confirmedName = await main(() => global.confirmedName);
  await open(base + "five");
  results.storeRuns = await marked();
  results.listed = await main(() => global.noorTest.extensions.list().map((x) => ({ name: x.name, version: x.version, source: x.source, icon: Boolean(x.icon) })));

  // 6. The store offers a newer version.
  results.updated = await main(() => global.noorTest.extensions.checkUpdates());
  results.versionAfterUpdate = await main(() => global.noorTest.extensions.list().map((x) => x.version));
  await open(base + "six");
  results.runsAfterUpdate = await marked();
  results.served = await main(() => global.served);

  console.log(JSON.stringify(results, null, 1));
  const ok = /^[a-p]{32}$/.test(results.folderId) && results.folderRuns === "yes"
    && results.toolbar.hidden === false && results.toolbar.buttons === 1 && results.toolbar.noIcon === false
    && results.toolbar.icon.includes(results.folderId) && results.toolbar.iconServed === "200 image/png"
    && results.popup.length === 1 && results.popup[0].endsWith("/popup.html")
    && results.popupPlace && results.popupPlace.rightAtButton && results.popupPlace.belowButton
    && results.popupPlace.insideWindow && results.popupPlace.insideScreen && results.popupPlace.keptOnScreen
    && results.siteServiceWorker === "none"
    && results.privateRuns === "no" && results.privateToolbar.extensionsHere === false && results.privateActionsHidden === true
    && results.optionsTitle === "Sample Options" && results.whenOff === "no" && results.whenOn === "yes"
    && results.crxId === results.crxIdExpected && results.crxRuns === "yes"
    && results.storeBefore.storeExtension && results.storeBefore.storeExtension.installed === false && results.storeButton.hidden === false
    && results.storeAfter.storeExtension.installed === true && results.storeButtonAfter.disabled === true && results.confirmedName === "Store Sample"
    && results.storeRuns === "yes" && results.listed.length === 1 && results.listed[0].name === "Store Sample" && results.listed[0].version === "2.0.0" && results.listed[0].icon
    && results.updated === 1 && results.versionAfterUpdate[0] === "2.0.1" && results.runsAfterUpdate === "yes";
  await app.close();
  server.close();
  console.log(ok ? "EXTENSIONS SMOKE OK" : "EXTENSIONS SMOKE FAILED");
  process.exit(ok ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });
