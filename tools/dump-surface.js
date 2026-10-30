// Lists what this app's Chromium shows pages: the globals of a window and
// of a worker, and the own properties of the interfaces and built-ins that
// differ between browsers, as tools/iphone_surface.js reads them.
// Run it with the app's Electron: `electron tools/dump-surface.js out.json`
// (on Linux under xvfb-run, with --no-sandbox as root).
"use strict";
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const http = require("http");

const out = process.argv[process.argv.length - 1];

const PAGE = String.raw`<!doctype html><meta charset="utf-8"><script>
const names = (o) => { try { return Object.getOwnPropertyNames(o); } catch (e) { return null; } };
const INTERFACES = ${JSON.stringify(require("./surface-interfaces.json"))};
const BUILTINS = ${JSON.stringify(require("./surface-builtins.json"))};
const read = (scope) => {
  const dump = { globals: names(scope), interfaces: {}, builtins: {} };
  for (const name of INTERFACES) {
    const C = scope[name];
    if (typeof C !== "function" && (typeof C !== "object" || !C)) continue;
    dump.interfaces[name] = { own: names(C), prototype: C.prototype ? names(C.prototype) : null };
  }
  for (const name of BUILTINS) {
    const C = scope[name];
    if (!C) continue;
    dump.builtins[name] = { own: names(C), prototype: C.prototype ? names(C.prototype) : null };
  }
  return dump;
};
const page = read(self);
const worker = new Worker(URL.createObjectURL(new Blob(["const names = " + names + "; const INTERFACES = " + JSON.stringify(INTERFACES) + "; const BUILTINS = " + JSON.stringify(BUILTINS) + "; const read = " + read + "; postMessage(read(self));"], { type: "text/javascript" })));
worker.onmessage = (event) => { window.dumped = JSON.stringify({ chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)[1], window: page, worker: event.data }); };
</script>`;

app.whenReady().then(async () => {
  // Served from this computer: a secure context, as an https:// site is, so
  // the interfaces only those get are listed too.
  const server = http.createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(PAGE);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  let text = null;
  for (let i = 0; i < 100 && !text; i++) {
    text = await win.webContents.executeJavaScript("window.dumped || null");
    if (!text) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  fs.writeFileSync(out, text || "{}");
  console.log(text ? `wrote ${out}` : "no dump");
  server.close();
  app.quit();
});
