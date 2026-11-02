// A second launch of Noor while it runs hands its address to the one
// running (as a pinned profile's button, a link from another program or a
// second click on the icon do), and that one opens it: also while it is
// still starting. Noor is started on a new data folder; a moment later,
// before it is up, it is started again with an address, then once more
// when it is up; each address must be asked for from this test's own
// server (the page opened). With NOOR_ELECTRON=<a built Noor>, that one.
// Needs a display: `xvfb-run -a node tools/smoke-second-launch.js`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const electronPath = process.env.NOOR_ELECTRON ? path.resolve(process.env.NOOR_ELECTRON) : require(path.join(root, "node_modules", "electron"));
const appArgs = fs.existsSync(path.join(path.dirname(electronPath), "resources", "app.asar")) ? [] : [root];
const launchArgs = process.platform === "linux" && process.getuid && process.getuid() === 0 ? ["--no-sandbox"] : [];

(async () => {
  const asked = [];
  const server = http.createServer((req, res) => {
    asked.push(req.url);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><title>${req.url}</title><p>${req.url}</p>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "noor-second-"));
  const env = { ...process.env, NOOR_USER_DATA: userData, NOOR_DEVICE: process.env.NOOR_DEVICE || "windows" };
  delete env.NOOR_TEST;
  const launch = (extra = []) => spawn(electronPath, [...appArgs, ...launchArgs, ...extra], { env, stdio: "ignore" });
  const waitFor = async (page, ms) => {
    for (let waited = 0; waited < ms && !asked.some((url) => url.startsWith(page)); waited += 100) await sleep(100);
    return asked.some((url) => url.startsWith(page));
  };

  const started = Date.now();
  // Each step said as it ends ("note …": in the checks' report too), so a
  // launch that hangs shows where.
  const said = (text) => console.log(`note ${((Date.now() - started) / 1000).toFixed(1)} s: ${text}`);
  // A launch's end, or "still running" after `ms` (then it is ended).
  const endOf = (child, ms) => Promise.race([
    new Promise((resolve) => child.on("exit", (code) => resolve(`exited (${code})`))),
    sleep(ms).then(() => {
      try { child.kill("SIGKILL"); } catch (error) {}
      return "still running";
    }),
  ]);
  const first = launch();
  const exited = new Promise((resolve) => first.on("exit", resolve));
  const report = {};
  said("Noor started");
  // While it starts: half a second after it was started.
  await sleep(500);
  const early = launch([`${base}/while-starting`]);
  report.secondExited = await endOf(early, 15000);
  said(`a second launch while it starts: ${report.secondExited}`);
  report.whileStarting = await waitFor("/while-starting", 20000);
  said(`its address ${report.whileStarting ? "opened" : "NOT OPENED"}`);
  // Once it is up.
  await sleep(3000);
  const later = launch([`${base}/once-up`]);
  report.laterExited = await endOf(later, 30000);
  said(`a second launch once it is up: ${report.laterExited}`);
  report.onceUp = await waitFor("/once-up", 20000);
  said(`its address ${report.onceUp ? "opened" : "NOT OPENED"}`);
  report.asked = asked;

  first.kill("SIGTERM");
  await Promise.race([exited, sleep(15000).then(() => first.kill("SIGKILL"))]);
  server.close();
  try { fs.rmSync(userData, { recursive: true, force: true }); } catch (error) {}
  console.log(JSON.stringify(report, null, 1));
  const ok = report.whileStarting && report.onceUp && report.secondExited.startsWith("exited") && report.laterExited.startsWith("exited");
  console.log(ok ? "SECOND LAUNCH OK" : `SECOND LAUNCH FAILED: while starting ${report.whileStarting ? "opened" : "LOST"}, once up ${report.onceUp ? "opened" : "LOST"}, the second launches ${report.secondExited}, ${report.laterExited}`);
  process.exit(ok ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
