// Whether Chromium's debugging pipe can stand in for its debugging port in
// Noor (see PROGRESS.md: the port lets any program on the PC in). Chromium
// reads its commands from descriptor 3 and writes its answers to 4 when
// started with --remote-debugging-pipe; Electron starts it after the app's
// own script ran, so the script opens two named pipes it serves itself and
// takes them as 3 and 4, if those are free in the process (on Windows,
// Chromium keeps its own files as handles, not descriptors; on Linux they
// hold Chromium's files, so this can't be tried there). Then: does a
// shared worker come through the pipe, held before its first line, and
// can code be run in it; does a page still read navigator.webdriver as
// false (the pipe marks the browser as automated; Noor turns that off).
// Run by Electron itself, on Windows:
//   node_modules\electron\dist\electron.exe tools\check-devtools-pipe.js
// Prints what it found; exits 0 if all of it works, 1 if not.
"use strict";
const fs = require("fs");
const net = require("net");
const http = require("http");
const crypto = require("crypto");
const { app, BrowserWindow } = require("electron");

const result = { platform: process.platform };
const done = (ok) => {
  result.ok = ok;
  console.log(JSON.stringify(result, null, 2));
  app.exit(ok ? 0 : 1);
};

/// The two pipes, as early as the script runs: Chromium's ends must be
/// descriptors 3 (it reads) and 4 (it writes).
const pipes = (() => {
  if (process.platform !== "win32") {
    result.why = "descriptors 3 and 4 hold Chromium's own files here";
    return null;
  }
  const name = (side) => `\\\\.\\pipe\\noor-devtools-${process.pid}-${crypto.randomBytes(12).toString("hex")}-${side}`;
  const toChromium = name("in");
  const fromChromium = name("out");
  const commands = net.createServer();
  const answers = net.createServer();
  // (Bound and listening as listen returns, for a pipe in this process.)
  commands.listen(toChromium);
  answers.listen(fromChromium);
  const readFd = fs.openSync(toChromium, fs.constants.O_RDONLY);
  const writeFd = fs.openSync(fromChromium, fs.constants.O_WRONLY);
  result.descriptors = [readFd, writeFd];
  if (readFd !== 3 || writeFd !== 4) {
    result.why = `the pipes got descriptors ${readFd} and ${writeFd}, not 3 and 4`;
    return null;
  }
  const connected = (server) => new Promise((resolve) => server.once("connection", (socket) => { server.close(); resolve(socket); }));
  app.commandLine.appendSwitch("remote-debugging-pipe");
  return { commands: connected(commands), answers: connected(answers) };
})();
app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");

app.whenReady().then(async () => {
  if (!pipes) return done(false);
  const commands = await pipes.commands;
  const answers = await pipes.answers;
  let nextId = 1;
  const pending = new Map();
  const events = [];
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    commands.write(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }) + "\0");
  });
  let buffer = "";
  answers.setEncoding("utf8");
  answers.on("data", (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\0")) >= 0) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
      } else if (message.method) {
        events.push(message);
        if (message.method === "Target.attachedToTarget") attached(message.params);
      }
    }
  });
  const attached = async ({ sessionId, targetInfo, waitingForDebugger }) => {
    (result.attached = result.attached || []).push(targetInfo.type);
    if (targetInfo.type === "shared_worker") {
      const evaluated = await send("Runtime.evaluate", { expression: "self.noorMark = 'reached'; self.noorMark" }, sessionId).catch((e) => ({ error: e.message }));
      result.sharedWorkerEvaluate = evaluated && evaluated.result ? evaluated.result.value : evaluated;
    }
    if (waitingForDebugger) await send("Runtime.runIfWaitingForDebugger", {}, sessionId).catch(() => {});
    if (targetInfo.type !== "shared_worker") await send("Target.detachFromTarget", { sessionId }).catch(() => {});
  };
  try {
    const version = await send("Browser.getVersion");
    result.browser = version.product;
    await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: "browser", exclude: true }, { type: "tab", exclude: true }, {}] });
  } catch (error) {
    result.why = "the pipe didn't answer: " + error.message;
    return done(false);
  }
  const web = http.createServer((req, res) => {
    if (req.url.startsWith("/shared.js")) {
      res.setHeader("content-type", "text/javascript");
      res.end("onconnect = (e) => e.ports[0].postMessage(String(self.noorMark))");
      return;
    }
    res.setHeader("content-type", "text/html");
    res.end(`<script>new Promise((r) => { const s = new SharedWorker('/shared.js?' + Math.random()); s.port.onmessage = (e) => r(e.data); setTimeout(() => r('timeout'), 8000); }).then((v) => { document.title = JSON.stringify({ shared: v, webdriver: navigator.webdriver }); });</script>`);
  }).listen(0, "127.0.0.1", () => {
    const win = new BrowserWindow({ show: false });
    win.webContents.on("page-title-updated", (event, title) => {
      try {
        const seen = JSON.parse(title);
        result.sharedWorkerSays = seen.shared;
        result.webdriver = seen.webdriver;
        web.close();
        done(seen.shared === "reached" && seen.webdriver === false);
      } catch (e) {}
    });
    win.loadURL(`http://127.0.0.1:${web.address().port}/`);
  });
  setTimeout(() => { result.why = "timed out"; done(false); }, 30000);
});
