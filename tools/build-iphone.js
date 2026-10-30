// Builds Noor iPhone: the same app, an app of its own (its name, its data,
// its shortcuts and installer), in which every profile is an iPhone to
// sites (see main/iphone.js). `npm run dist:iphone`, after `npm run dist`
// or on its own; the .exe files go to dist/ beside Noor's.
"use strict";
const builder = require("electron-builder");
const base = require("../package.json").build;

const config = {
  ...base,
  appId: "ma.noor.iphone",
  productName: "Noor iPhone",
  // Read by main/iphone.js, and Electron's app name (the data folder).
  extraMetadata: { noorDevice: "iphone", productName: "Noor iPhone" },
  nsis: {
    ...base.nsis,
    shortcutName: "Noor iPhone",
    artifactName: "Noor-iPhone-Setup-${version}-windows-${arch}.${ext}",
  },
  portable: {
    ...base.portable,
    artifactName: "Noor-iPhone-${version}-windows-${arch}-portable.${ext}",
  },
};

builder.build({
  targets: builder.Platform.WINDOWS.createTarget(null, builder.Arch.x64),
  config,
  publish: "never",
}).then((files) => {
  console.log(files.filter((file) => file.endsWith(".exe")).join("\n"));
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
