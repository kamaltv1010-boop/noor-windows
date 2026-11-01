// Builds Noor Android: the same app, an app of its own (its name, its data,
// its shortcuts and installer), in which every profile is an Android phone
// or tablet to sites (see main/android.js). `npm run dist:android`, after
// `npm run dist` or on its own; the .exe files go to dist/ beside Noor's.
"use strict";
const builder = require("electron-builder");
const base = require("../package.json").build;

const config = {
  ...base,
  appId: "ma.noor.android",
  productName: "Noor Android",
  // Read by main/iphone.js, and Electron's app name (the data folder).
  extraMetadata: { noorDevice: "android", productName: "Noor Android" },
  nsis: {
    ...base.nsis,
    shortcutName: "Noor Android",
    artifactName: "Noor-Android-Setup-${version}-windows-${arch}.${ext}",
  },
  portable: {
    ...base.portable,
    artifactName: "Noor-Android-${version}-windows-${arch}-portable.${ext}",
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
