// Noor's installer on Windows itself, as a user installs: the Setup .exe
// run silently (/S, per user, as its own pages would by default), then
// what it put where — the app in %LOCALAPPDATA%\Programs\<name>, its
// uninstaller, the desktop and Start menu shortcuts, its entry in Windows'
// installed apps (HKCU …\Uninstall) — and the installed .exe's fuses; the
// installed app's first start on its own data folder (%APPDATA%\<name>),
// with tools/probe-built-app.js (profiles, settings, closed and opened
// again); then uninstalled silently: the app, its shortcuts and its entry
// must be gone (the data folder is the user's and stays, as Windows apps
// leave it).
//   node tools/check-install.js <the Setup .exe> [--out <folder>]
// Windows only. Prints every step; exits 1 if one failed.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
const setup = path.resolve(args[0] || "");
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? path.resolve(args[outAt + 1]) : null;
if (out) fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = { setup: path.basename(setup), system: `${os.type()} ${os.release()} (${os.version()})`, steps: [], problems: [] };
const step = (name, ok, detail) => {
  report.steps.push({ name, ok, detail });
  console.error(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : ": " + (typeof detail === "string" ? detail : JSON.stringify(detail))}`);
  if (!ok) report.problems.push(`${name}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
};
const finish = () => {
  if (out) fs.writeFileSync(path.join(out, `install-${report.product || "noor"}.json`.replace(/ /g, "-")), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  // (Last, what failed: a CI log shows the last lines of a check, and the
  // report above is long.)
  console.error("PROBLEMS " + JSON.stringify(report.problems));
  process.exit(report.problems.length ? 1 : 0);
};

if (process.platform !== "win32") {
  step("Windows", false, "this check installs on Windows only");
  finish();
}

/// The product a Setup .exe installs: its name (the folder, the .exe, the
/// shortcuts and the data folder are named after it).
const PRODUCTS = [[/^Noor-iPhone-Setup-/, "Noor iPhone"], [/^Noor-Android-Setup-/, "Noor Android"], [/^Noor-Setup-/, "Noor"]];
const product = (PRODUCTS.find(([pattern]) => pattern.test(path.basename(setup))) || [])[1];
report.product = product;
const local = process.env.LOCALAPPDATA;
const roaming = process.env.APPDATA;
const folder = path.join(local, "Programs", product || "?");
const appExe = path.join(folder, `${product}.exe`);
const uninstaller = path.join(folder, `Uninstall ${product}.exe`);
const shortcuts = [path.join(os.homedir(), "Desktop", `${product}.lnk`), path.join(roaming, "Microsoft", "Windows", "Start Menu", "Programs", `${product}.lnk`)];
const dataFolder = path.join(roaming, product || "?");

/// Windows' installed apps entry for the product (HKCU …\Uninstall), as
/// reg prints it, or null.
const entry = () => {
  const found = spawnSync("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall", "/s", "/f", product, "/d"], { encoding: "utf8" }).stdout || "";
  const blocks = found.split(/\r?\n(?=HKEY_)/).filter((block) => new RegExp(`DisplayName\\s+REG_SZ\\s+${product}( |$)`, "m").test(block));
  if (!blocks.length) return null;
  const values = {};
  for (const line of blocks[0].split(/\r?\n/).slice(1)) {
    const match = /^\s+(\S+)\s+REG_\w+\s+(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
};

(async () => {
  step("the Setup .exe is there", Boolean(product) && fs.existsSync(setup), setup);
  if (!product || !fs.existsSync(setup)) return finish();

  // Installed as a user would, silently.
  const installed = Date.now();
  const run = spawnSync(setup, ["/S"], { timeout: 300000 });
  for (let i = 0; i < 120 && !fs.existsSync(appExe); i++) await sleep(500);
  step("installs (Setup /S)", run.status === 0 && fs.existsSync(appExe), `exit ${run.status}, ${Date.now() - installed} ms, ${appExe}`);
  if (!fs.existsSync(appExe)) return finish();
  step("its uninstaller is there", fs.existsSync(uninstaller), uninstaller);
  step("its files are there (resources\\app.asar)", fs.existsSync(path.join(folder, "resources", "app.asar")));
  for (const shortcut of shortcuts) step(`shortcut: ${path.basename(path.dirname(shortcut))}\\${path.basename(shortcut)}`, fs.existsSync(shortcut), shortcut);
  const values = entry();
  step("Windows lists it in its installed apps (HKCU …\\Uninstall)", Boolean(values), values ? { DisplayName: values.DisplayName, DisplayVersion: values.DisplayVersion, InstallLocation: values.InstallLocation, Publisher: values.Publisher } : null);
  const acl = (spawnSync("icacls", [folder], { encoding: "utf8" }).stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  report.installFolderAccess = acl;
  step("the install folder is the user's (icacls)", !/Everyone:.*\((F|M|W)/i.test(acl.join("\n")), acl.slice(0, 5).join(" ; "));

  // Its fuses, read from the installed .exe.
  const fuses = spawnSync(process.execPath, [path.join(__dirname, "check-fuses.js"), appExe], { encoding: "utf8" });
  step("the installed .exe's fuses", fuses.status === 0, (fuses.stdout + fuses.stderr).trim().split(/\r?\n/).join(" ; "));

  // Its first start, on its own data folder, and what a user does next.
  const dataBefore = fs.existsSync(dataFolder);
  const probe = spawnSync(process.execPath, [path.join(__dirname, "probe-built-app.js"), appExe, "--own-data", dataFolder, ...(out ? ["--out", path.join(out, `installed-${product.replace(/ /g, "-")}`)] : [])], { encoding: "utf8", timeout: 600000 });
  // (Its report: the JSON it prints, from its first "{" to its last "}".)
  let probed = null;
  try {
    const said = probe.stdout || "";
    probed = JSON.parse(said.slice(said.indexOf("{"), said.lastIndexOf("}") + 1));
  } catch (error) {
    probed = null;
  }
  report.firstStart = probed;
  // What failed, by name; without its report, the lines it wrote that say FAIL.
  const failedLines = (probe.stderr || "").split(/\r?\n/).filter((line) => line.startsWith("FAIL")).map((line) => line.slice(0, 600));
  step(`the installed app's first start and use (probe-built-app.js${dataBefore ? ", its data folder was already there" : ""})`, probe.status === 0, probed ? (probed.problems.length ? probed.problems : `${probed.steps.length} steps passed`) : failedLines.length ? failedLines : (probe.stderr || "").slice(-600));
  if (probed && probed.closing) {
    report.closing = probed.closing;
  }

  // Uninstalled silently: the uninstaller runs from a copy of itself.
  const removed = Date.now();
  const un = spawnSync(uninstaller, ["/S"], { timeout: 300000 });
  for (let i = 0; i < 240 && fs.existsSync(appExe); i++) await sleep(500);
  step("uninstalls (Uninstall /S)", un.status === 0 && !fs.existsSync(appExe), `exit ${un.status}, ${Date.now() - removed} ms`);
  await sleep(2000);
  step("its folder is gone", !fs.existsSync(folder), folder);
  for (const shortcut of shortcuts) step(`shortcut gone: ${path.basename(path.dirname(shortcut))}\\${path.basename(shortcut)}`, !fs.existsSync(shortcut));
  step("Windows no longer lists it", entry() === null);
  report.dataFolderKept = fs.existsSync(dataFolder);
  step("the user's data folder is left as it is (Windows apps leave it)", true, report.dataFolderKept ? `kept: ${dataFolder}` : "not there");
  finish();
})().catch((error) => {
  step("the check ran to its end", false, String((error && error.stack) || error));
  finish();
});
