// What another program can do to Noor's main process through Noor's own
// executable: run a script as Node (ELECTRON_RUN_AS_NODE), load a file
// into the app as it starts (NODE_OPTIONS --require), open a Node debugger
// on it (--inspect). Each is turned off by a fuse package.json flips in
// the built app (build.electronFuses; tools/check-fuses.js reads them);
// Electron as it comes allows all three.
//   xvfb-run -a node tools/probe-fuses.js [electron]   (Windows: no xvfb-run)
// [electron]: a built Noor (dist/linux-unpacked/noor-browser, from
// `npx electron-builder --linux dir`), or node_modules' Electron (the
// default). Prints what each way did; exits 1 if one worked.
"use strict";
const fs = require("fs");
const os = require("os");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const exe = process.argv[2] ? path.resolve(process.argv[2]) : require(path.join(root, "node_modules", "electron"));
/// A built app has its code beside it; Electron alone is given the source.
const appArgs = fs.existsSync(path.join(path.dirname(exe), "resources", "app.asar")) ? [] : [root];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const work = fs.mkdtempSync(path.join(os.tmpdir(), "noor-fuses-"));

/// Starts `exe` with `args` and `env`, waits `ms` (or until `done()`),
/// asks it to quit and waits until it has.
const run = async (args, env, ms, done = () => false) => {
  const child = spawn(exe, args, { env: { ...process.env, NOOR_USER_DATA: path.join(work, "data"), ...env }, stdio: "ignore" });
  const exited = new Promise((resolve) => child.on("exit", resolve));
  const until = Date.now() + ms;
  let gone = false;
  exited.then(() => (gone = true));
  while (!gone && !done() && Date.now() < until) await sleep(200);
  const result = done();
  child.kill("SIGTERM");
  await Promise.race([exited, sleep(15000).then(() => child.kill("SIGKILL"))]);
  return result;
};

const portOpen = (port) => new Promise((resolve) => {
  const socket = net.connect(port, "127.0.0.1");
  socket.on("connect", () => { socket.destroy(); resolve(true); });
  socket.on("error", () => resolve(false));
});

const freePort = () => new Promise((resolve) => {
  const server = net.createServer().listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

(async () => {
  const result = { electron: exe };
  const env = { NOOR_DEVICE: "windows" };
  delete process.env.NOOR_TEST;

  // As Node: a script that leaves a file.
  const asNode = path.join(work, "ran-as-node");
  await run(["-e", `require("fs").writeFileSync(${JSON.stringify(asNode)}, "1")`], { ...env, ELECTRON_RUN_AS_NODE: "1" }, 8000, () => fs.existsSync(asNode));
  result.runAsNode = fs.existsSync(asNode) ? "ran the script as Node" : "ignored";

  // NODE_OPTIONS: a file required into the app as it starts.
  const loaded = path.join(work, "loaded");
  const inject = path.join(work, "inject.js");
  fs.writeFileSync(inject, `require("fs").writeFileSync(${JSON.stringify(loaded)}, "1");\n`);
  await run([...appArgs, "--no-sandbox"], { ...env, NODE_OPTIONS: `--require ${JSON.stringify(inject)}` }, 10000, () => fs.existsSync(loaded));
  result.nodeOptions = fs.existsSync(loaded) ? "loaded the file into the app" : "ignored";

  // --inspect: a Node debugger on a port of its own.
  const port = await freePort();
  let open = false;
  const app = spawn(exe, [...appArgs, "--no-sandbox", `--inspect=${port}`], { env: { ...process.env, NOOR_USER_DATA: path.join(work, "data"), ...env }, stdio: "ignore" });
  const appExited = new Promise((resolve) => app.on("exit", resolve));
  for (let i = 0; i < 40 && !open; i++) {
    await sleep(250);
    open = await portOpen(port);
  }
  app.kill("SIGTERM");
  await Promise.race([appExited, sleep(15000).then(() => app.kill("SIGKILL"))]);
  result.inspect = open ? `a debugger answered on port ${port}` : "no debugger";

  result.problems = [
    result.runAsNode !== "ignored" && "ELECTRON_RUN_AS_NODE: " + result.runAsNode,
    result.nodeOptions !== "ignored" && "NODE_OPTIONS: " + result.nodeOptions,
    result.inspect !== "no debugger" && "--inspect: " + result.inspect,
  ].filter(Boolean);
  fs.rmSync(work, { recursive: true, force: true });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
