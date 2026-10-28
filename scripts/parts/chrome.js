// Chrome: pages see Google Chrome's brands in navigator.userAgentData, as
// the user agent and the request headers say, not Chromium's own.
{
  const data = window.navigator.userAgentData;
  const chrome = config.chrome;
  if (data && chrome && chrome.brands) {
    const proto = getPrototypeOf(data);
    const copy = (list) => list.map((b) => ({ brand: b.brand, version: b.version }));
    defineGetter(proto, "brands", () => copy(chrome.brands));
    define(proto, "getHighEntropyValues", (original) => function (hints) {
      return original.call(this, hints).then((values) => {
        if ("brands" in values) values.brands = copy(chrome.brands);
        if ("fullVersionList" in values && chrome.fullVersionList) values.fullVersionList = copy(chrome.fullVersionList);
        if ("uaFullVersion" in values && chrome.fullVersion) values.uaFullVersion = chrome.fullVersion;
        return values;
      });
    });
    define(proto, "toJSON", (original) => function () {
      const values = original.call(this);
      values.brands = copy(chrome.brands);
      return values;
    });
  }
}

// Chrome's own object: chrome.app, chrome.csi() and chrome.loadTimes(),
// which Chromium without Chrome's parts leaves empty.
{
  const chromeObject = window.chrome;
  if (chromeObject && typeof chromeObject === "object" && !("app" in chromeObject)) {
    const timing = () => (window.performance && window.performance.timing) || null;
    const seconds = (value) => (value ? value / 1000 : 0);
    const add = (name, value) => defineProperty(chromeObject, name, { value, writable: true, enumerable: true, configurable: true });
    add("loadTimes", method("loadTimes", 0, () => {
      const t = timing() || {};
      return {
        requestTime: seconds(t.navigationStart),
        startLoadTime: seconds(t.fetchStart),
        commitLoadTime: seconds(t.responseStart),
        finishDocumentLoadTime: seconds(t.domContentLoadedEventEnd),
        finishLoadTime: seconds(t.loadEventEnd),
        firstPaintTime: seconds(t.responseStart) + 0.05,
        firstPaintAfterLoadTime: 0,
        navigationType: "Other",
        wasFetchedViaSpdy: true,
        wasNpnNegotiated: true,
        npnNegotiatedProtocol: "h2",
        wasAlternateProtocolAvailable: false,
        connectionInfo: "h2",
      };
    }));
    add("csi", method("csi", 0, () => {
      const t = timing();
      const at = now();
      return {
        startE: t ? t.navigationStart : at,
        onloadT: t ? t.domContentLoadedEventEnd : at,
        pageT: t ? at - t.navigationStart + 0.123 : 0,
        tran: 15,
      };
    }));
    add("app", {
      isInstalled: false,
      InstallState: { DISABLED: "disabled", INSTALLED: "installed", NOT_INSTALLED: "not_installed" },
      RunningState: { CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" },
      getDetails: method("getDetails", 0, () => null),
      getIsInstalled: method("getIsInstalled", 0, () => false),
      installState: method("installState", 0, function (callback) {
        if (typeof callback === "function") callback("not_installed");
      }),
      runningState: method("runningState", 0, () => "cannot_run"),
    });
  }
}
