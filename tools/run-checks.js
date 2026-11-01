// Runs a suite of Noor's checks (tools/checks/*.json), each in a process
// of its own with a time limit, what it printed kept in a log of its own,
// then writes a report, in Arabic for the user and as JSON: the machine
// (Windows' version), Noor's version, and for each check its command, its
// result, how long it took, where its log is, and whether Noor (or
// Electron) left processes behind. Made for the Windows checks job in CI;
// runs anywhere.
//   node tools/run-checks.js <suite.json> [--out <folder>] [--only name,name]
// A suite: [{ "name": "…", "title": "…" (Arabic), "command": ["node",
// "tools/x.js", …] ("electron": node_modules' Electron), "env": {…},
// "minutes": 10, "kind": "headless" | "app", "expect": "pass" | "problem" }]
// "kind": "headless" needs no window; "app": Noor (or Electron) runs with
// its windows, driven by code (no clicking). "expect": "problem": a known
// problem the check shows (exit 1 = shown as before, 0 = not seen).
// In commands and env: {out} (this run's folder) and {exe}, {exe:iphone},
// {exe:android}, {setup}, {setup:iphone}, {setup:android}, from NOOR_EXE,
// NOOR_EXE_IPHONE… and NOOR_SETUP… Exits 1 if a check didn't end as
// expected.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; };
const suiteFile = path.resolve(args[0] || "");
const out = path.resolve(option("--out") || path.join(os.tmpdir(), "noor-checks"));
const only = option("--only") ? option("--only").split(",") : null;
const WINDOWS = process.platform === "win32";
fs.mkdirSync(path.join(out, "logs"), { recursive: true });

const places = {
  out,
  exe: process.env.NOOR_EXE, "exe:iphone": process.env.NOOR_EXE_IPHONE, "exe:android": process.env.NOOR_EXE_ANDROID,
  setup: process.env.NOOR_SETUP, "setup:iphone": process.env.NOOR_SETUP_IPHONE, "setup:android": process.env.NOOR_SETUP_ANDROID,
};
const fill = (text) => String(text).replace(/\{([a-z:]+)\}/g, (all, name) => (places[name] !== undefined ? path.resolve(places[name]) : all));
const electronPath = require(path.join(root, "node_modules", "electron"));

/// The machine and the app, for the report's head.
const machine = () => {
  const facts = { system: `${os.type()} ${os.release()}`, version: os.version ? os.version() : "", arch: os.arch(), cpus: `${os.cpus().length} × ${(os.cpus()[0] || {}).model || "?"}`, memory: `${Math.round(os.totalmem() / 2 ** 30)} GB` };
  if (WINDOWS) {
    const ps = (command) => (spawnSync("powershell", ["-NoProfile", "-Command", command], { encoding: "utf8" }).stdout || "").trim();
    facts.windows = ps("$o = Get-CimInstance Win32_OperatingSystem; \"$($o.Caption) $($o.Version) (build $($o.BuildNumber)), $($o.OSArchitecture)\"");
    facts.graphics = ps("(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }) -join ', '");
    facts.screen = ps("Add-Type -AssemblyName System.Windows.Forms; $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; \"$($b.Width)x$($b.Height)\"");
    facts.user = ps("whoami");
    facts.session = ps("\"session $((Get-Process -Id $PID).SessionId), interactive: $([Environment]::UserInteractive)\"");
  }
  const pkg = require(path.join(root, "package.json"));
  const sha = (process.env.GITHUB_SHA || spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout || "").trim().slice(0, 7);
  facts.noor = `${process.env.NOOR_VERSION || pkg.version}${sha ? ` (commit ${sha})` : ""}`;
  facts.electron = require(path.join(root, "node_modules", "electron", "package.json")).version;
  const chrome = spawnSync(electronPath, ["-p", "process.versions.chrome"], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8" });
  facts.chromium = (chrome.stdout || "").trim();
  facts.node = process.version;
  if (process.env.GITHUB_RUN_ID) facts.run = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  return facts;
};

/// Noor's and Electron's processes still running (by program name).
const NAMES = ["Noor.exe", "Noor iPhone.exe", "Noor Android.exe", "electron.exe"];
const leftovers = () => {
  if (!WINDOWS) return [];
  const list = spawnSync("tasklist", ["/FO", "CSV", "/NH"], { encoding: "utf8" }).stdout || "";
  return list.split(/\r?\n/).map((line) => (line.match(/^"([^"]+)","(\d+)"/) || []).slice(1)).filter(([name]) => NAMES.includes(name));
};
const clearLeftovers = () => {
  if (WINDOWS) for (const name of NAMES) spawnSync("taskkill", ["/F", "/T", "/IM", name], { stdio: "ignore" });
};

const runOne = (check) => new Promise((resolve) => {
  const command = check.command.map(fill);
  const program = command[0] === "node" ? process.execPath : command[0] === "electron" ? electronPath : command[0];
  const env = { ...process.env };
  for (const [key, value] of Object.entries(check.env || {})) env[key] = fill(value);
  const log = path.join(out, "logs", `${check.name}.log`);
  const stream = fs.createWriteStream(log);
  const started = Date.now();
  // (Electron run as root on Linux needs Chromium's sandbox off.)
  const extra = program === electronPath && !WINDOWS && process.getuid && process.getuid() === 0 ? ["--no-sandbox"] : [];
  const child = spawn(program, [...command.slice(1), ...extra], { cwd: root, env, detached: !WINDOWS });
  child.stdout.pipe(stream, { end: false });
  child.stderr.pipe(stream, { end: false });
  let timedOut = false;
  const limit = setTimeout(() => {
    timedOut = true;
    if (WINDOWS) spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
    else try { process.kill(-child.pid, "SIGKILL"); } catch (e) {}
  }, (check.minutes || 10) * 60000);
  child.on("close", (code) => {
    clearTimeout(limit);
    stream.end();
    resolve({ code: timedOut ? "timeout" : code, ms: Date.now() - started, log, command: command.join(" ") });
  });
  child.on("error", (error) => {
    clearTimeout(limit);
    stream.end(String(error));
    resolve({ code: "error", ms: Date.now() - started, log, command: command.join(" ") });
  });
});

/// What a check's exit means, against what was expected of it.
const verdict = (check, code) => {
  const expect = check.expect || "pass";
  if (expect === "problem") {
    if (code === 1) return { ok: true, label: "مشكلة معروفة: ظهرت كما هي (مؤكَّدة)" };
    if (code === 0) return { ok: true, label: "المشكلة المعروفة لم تظهر هنا" };
  } else {
    if (code === 0) return { ok: true, label: "نجح" };
    if (code === 1) return { ok: false, label: "فشل: وجد مشكلة" };
  }
  return { ok: false, label: code === "timeout" ? "تعذّر: تجاوز الوقت" : `تعذّر التشغيل (رمز الخروج ${code})` };
};

(async () => {
  const suite = JSON.parse(fs.readFileSync(suiteFile, "utf8")).filter((check) => !only || only.includes(check.name));
  const facts = machine();
  clearLeftovers();
  const results = [];
  for (const check of suite) {
    process.stdout.write(`▶ ${check.name} … `);
    const run = await runOne(check);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const left = leftovers();
    clearLeftovers();
    const judged = verdict(check, run.code);
    results.push({ name: check.name, title: check.title || check.name, kind: check.kind || "app", expect: check.expect || "pass", ...run, log: path.relative(out, run.log).split(path.sep).join("/"), ...judged, leftProcesses: left.map(([name, pid]) => `${name} ${pid}`) });
    console.log(`${judged.label} (${Math.round(run.ms / 1000)} s${left.length ? `, ${left.length} processes left` : ""})`);
    if (!judged.ok) {
      // What it said, in the job's own log too (the artifact may not be
      // reachable): its last lines, without Chromium's own chatter.
      const said = fs.readFileSync(run.log, "utf8").split(/\r?\n/).filter((line) => line.trim() && !/^\[\d+:\d+\/\d+\.\d+:(WARNING|INFO|VERBOSE)/.test(line) && !/^\[electron\] \[\d+:/.test(line));
      console.log(`::group::${check.name}: آخر ما كتبه`);
      console.log(said.slice(-70).join("\n"));
      console.log("::endgroup::");
    }
  }
  const kinds = { headless: "بدون واجهة", app: "التطبيق بواجهته، يُقاد بالكود" };
  const lines = [
    `# نتائج الاختبارات: ${path.basename(suiteFile, ".json")}`,
    "",
    `- **النظام:** ${facts.windows || facts.version} — ${facts.system}, ${facts.arch}`,
    ...(WINDOWS ? [`- **الجلسة:** ${facts.session}, المستخدم ${facts.user}, الشاشة ${facts.screen}, الرسوميات: ${facts.graphics || "؟"}`] : []),
    `- **المعالج والذاكرة:** ${facts.cpus}, ${facts.memory}`,
    `- **إصدار Noor:** ${facts.noor} — Electron ${facts.electron}, Chromium ${facts.chromium}, Node ${facts.node}`,
    ...(facts.run ? [`- **التشغيل في CI:** ${facts.run} (السجلات في الـ artifact الخاص بهذه المهمة، مجلد \`logs/\`)`] : []),
    "",
    "| الاختبار | النوع | الأمر | النتيجة | المدة | السجل |",
    "|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.title} | ${kinds[r.kind] || r.kind} | \`${r.command.replace(/\|/g, "\\|").replace(root + path.sep, "")}\` | ${r.ok ? "✅" : "❌"} ${r.label}${r.leftProcesses.length ? ` — بقيت ${r.leftProcesses.length} عمليات بعده` : ""} | ${Math.round(r.ms / 1000)} ث | \`${r.log}\` |`),
    "",
    `**المجموع:** ${results.filter((r) => r.ok).length} من ${results.length} كما هو متوقَّع.`,
  ];
  const markdown = lines.join("\n");
  fs.writeFileSync(path.join(out, "report.md"), markdown + "\n");
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ suite: path.basename(suiteFile), facts, results }, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n\n");
  console.log("\n" + markdown);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
