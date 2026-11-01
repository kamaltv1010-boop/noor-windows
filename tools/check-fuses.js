// Checks the Electron fuses of a built Noor against package.json's
// build.electronFuses: cookies encrypted on the disk (as Chrome keeps them;
// Electron's own default is plain text), and no way into the app's main
// process for another program (no running Noor.exe as Node with
// ELECTRON_RUN_AS_NODE, no NODE_OPTIONS, no --inspect debugger). Reads
// each fuse from the executable itself, as electron-builder left it.
// CI runs it after each build: `node tools/check-fuses.js "dist/win-unpacked/Noor.exe"`.
// Prints each fuse; exits 1 if one isn't as asked.
"use strict";
const path = require("path");
const { getCurrentFuseWire, FuseV1Options } = require("@electron/fuses");

const wanted = require("../package.json").build.electronFuses;
/// package.json's names (electron-builder's) → the wire's.
const WIRE = {
  runAsNode: FuseV1Options.RunAsNode,
  enableCookieEncryption: FuseV1Options.EnableCookieEncryption,
  enableNodeOptionsEnvironmentVariable: FuseV1Options.EnableNodeOptionsEnvironmentVariable,
  enableNodeCliInspectArguments: FuseV1Options.EnableNodeCliInspectArguments,
  enableEmbeddedAsarIntegrityValidation: FuseV1Options.EnableEmbeddedAsarIntegrityValidation,
  onlyLoadAppFromAsar: FuseV1Options.OnlyLoadAppFromAsar,
  loadBrowserProcessSpecificV8Snapshot: FuseV1Options.LoadBrowserProcessSpecificV8Snapshot,
  grantFileProtocolExtraPrivileges: FuseV1Options.GrantFileProtocolExtraPrivileges,
};
/// A fuse's state on the wire: "1" on, "0" off.
const ON = "1".charCodeAt(0);
const OFF = "0".charCodeAt(0);

(async () => {
  const files = process.argv.slice(2);
  if (!files.length || !wanted) {
    console.error("usage: node tools/check-fuses.js <built Noor's executable>... (and build.electronFuses in package.json)");
    process.exit(2);
  }
  const problems = [];
  for (const file of files) {
    const wire = await getCurrentFuseWire(path.resolve(file));
    for (const [name, on] of Object.entries(wanted)) {
      const state = wire[WIRE[name]];
      const shown = state === ON ? "on" : state === OFF ? "off" : `unknown (${state})`;
      console.log(`${path.basename(file)}: ${name} ${shown}`);
      if (state !== (on ? ON : OFF)) problems.push(`${file}: ${name} is ${shown}, not ${on ? "on" : "off"}`);
    }
  }
  for (const problem of problems) console.error(problem);
  process.exit(problems.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
