// Electron runs this beside every service worker of the session, in its own
// realm, before the worker's script: the worker's address goes to the main
// process for the page's config, and the protection runs in the worker's
// own world with it, so a page's service worker sees the same fingerprint
// as the page (a site compares the two).
(() => {
  let url = "";
  try {
    url = String(contextBridge.executeInMainWorld({ func: () => self.location.href }));
  } catch (error) {
    return;
  }
  let config = null;
  try {
    config = ipcRenderer.sendSync("noor:sw-config", url);
  } catch (error) {
    return;
  }
  if (!config) {
    return;
  }
  try {
    // Made as a function so it can be given to the worker's world, under
    // the name the app gives it for this run (see WORKER_SCRIPT_NAME in
    // main/main.js), so a stack that shows its frames shows no path.
    const run = new Function("config", protectSource.split("noor lookalike").join(String(config.mark || "noor lookalike")) + "\ntry { protectPage(self, config); } catch (e) {}\n//# sourceURL=" + String(config.scriptName || "protect.js").replace(/\s/g, ""));
    contextBridge.executeInMainWorld({ func: run, args: [config] });
  } catch (error) {
    // The worker runs unprotected rather than not at all.
  }
})();
