(() => {
  const location = window.location;
  if (location.protocol === "noor:") {
    // The app's own pages: the toolbar, the start page, settings, the library.
    window.noor = {
      invoke: (channel, ...args) => ipcRenderer.invoke("noor:" + channel, ...args),
      on: (channel, listener) => {
        ipcRenderer.on("noor:" + channel, (event, ...args) => listener(...args));
      },
    };
    return;
  }
  let config = null;
  try {
    config = ipcRenderer.sendSync("noor:page-config", location.href);
  } catch (error) {
    config = null;
  }
  if (config) {
    try {
      protectPage(window, config);
    } catch (error) {
      // The page is shown unprotected rather than not at all.
    }
  }
})();
