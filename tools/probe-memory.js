// Memory and CPU of a build of Noor ("windows", "iphone" or "android"):
// opens and closes 40 tabs of a page with frames, a worker and some drawing,
// one after the other, and compares the app's processes, their memory and
// the browser's own heap before and after (a tab that stays in memory after
// it closed is a leak); then measures the CPU the app takes with one quiet
// page open for 10 seconds. Prints the numbers; exits 1 if a closed tab's
// page stays, or the app's memory grew by more than half.
// Needs Playwright and a display: `xvfb-run -a node tools/probe-memory.js [windows|iphone|android]`.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { _electron: electron } = require("playwright");

const root = path.join(__dirname, "..");
const BUILD = ["iphone", "android"].includes(process.argv[2]) ? process.argv[2] : "windows";
const TABS = 40;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PAGE = `<!doctype html><title>memory</title><body>
<iframe srcdoc="<p>frame</p>"></iframe><iframe src="/frame"></iframe>
<canvas id="c" width="400" height="200"></canvas>
<script>
const x = document.getElementById("c").getContext("2d");
for (let i = 0; i < 200; i++) { x.fillStyle = "hsl(" + i + ",50%,50%)"; x.fillText("Noor " + i, (i * 7) % 380, (i * 13) % 190); }
x.getImageData(0, 0, 400, 200);
new Worker(URL.createObjectURL(new Blob(["postMessage(navigator.hardwareConcurrency)"])));
const big = new Array(20000).fill(0).map((_, i) => ({ i, s: "item " + i }));
document.title = "memory " + big.length;
</script></body>`;

(async () => {
  const web = http.createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(req.url.startsWith("/frame") ? "<p>other frame</p>" : PAGE);
  });
  await new Promise((resolve) => web.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${web.address().port}/`;
  const app = await electron.launch({
    executablePath: require(path.join(root, "node_modules", "electron")),
    args: [root, "--no-sandbox", "--js-flags=--expose-gc"],
    env: { ...process.env, NOOR_TEST: "1", NOOR_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), "noor-memory-")), NOOR_DEVICE: BUILD, NOOR_TEST_TIMEZONE: "Africa/Casablanca" },
  });
  const main = (fn, arg) => app.evaluate(fn, arg);
  for (let i = 0; i < 200; i++) {
    if (await main(() => Boolean(global.noorTest && global.noorTest.browser && global.noorTest.browser.selected)).catch(() => false)) break;
    await sleep(100);
  }
  await sleep(3000);
  const measure = () => main(({ app, webContents }) => {
    if (global.gc) global.gc();
    const metrics = app.getAppMetrics();
    return {
      processes: metrics.length,
      memoryMB: Math.round(metrics.reduce((sum, m) => sum + (m.memory ? m.memory.workingSetSize : 0), 0) / 1024),
      mainHeapMB: Math.round(process.memoryUsage().heapUsed / 1048576 * 10) / 10,
      webContents: webContents.getAllWebContents().length,
      tabs: global.noorTest.browser.tabs.length,
    };
  });
  const before = await measure();
  for (let i = 0; i < TABS; i++) {
    await main((electron, url) => { global.noorTest.browser.newTab({ url }); }, base + "?" + i);
    await sleep(400);
    await main(() => { const b = global.noorTest.browser; b.close(b.selected); });
    await sleep(100);
  }
  await sleep(5000);
  const after = await measure();
  // CPU with one quiet page.
  await main((electron, url) => { global.noorTest.browser.newTab({ url }); }, base + "?quiet");
  await sleep(3000);
  await main(({ app }) => { app.getAppMetrics(); });
  await sleep(10000);
  const cpu = await main(({ app }) => app.getAppMetrics().map((m) => ({ type: m.type, cpu: Math.round(m.cpu.percentCPUUsage * 100) / 100 })));
  await app.close().catch(() => {});
  web.close();
  const result = { build: BUILD, tabs: TABS, before, after, idleCpu: cpu, idleCpuTotal: Math.round(cpu.reduce((s, m) => s + m.cpu, 0) * 100) / 100 };
  const problems = [];
  if (after.webContents > before.webContents) problems.push(`${after.webContents - before.webContents} closed tabs' pages stayed`);
  if (after.memoryMB > before.memoryMB * 1.5) problems.push(`memory grew from ${before.memoryMB} to ${after.memoryMB} MB`);
  result.problems = problems;
  console.log(JSON.stringify(result, null, 2));
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
