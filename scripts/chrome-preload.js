"use strict";
// The preload of the app's own toolbar page: the app's API, and the
// extensions' buttons (<browser-action-list>, from electron-chrome-extensions).
const { ipcRenderer } = require("electron");

window.noor = {
  invoke: (channel, ...args) => ipcRenderer.invoke("noor:" + channel, ...args),
  on: (channel, listener) => {
    ipcRenderer.on("noor:" + channel, (event, ...args) => listener(...args));
  },
};

try {
  require("electron-chrome-extensions/browser-action").injectBrowserAction();
} catch (error) {
  // The toolbar works without the extensions' buttons.
}
