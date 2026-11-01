// Noor (a PC, config.hardware set): the battery navigator.getBattery()
// tells, as a PC's that is plugged in and full (a desktop's, or a laptop's
// on its charger: the most common answer), the same in every profile.
// Chrome on Windows tells this computer's own level, charging state and
// times: read at the same moment, the same in every profile, so a site in
// two profiles could join them by it. Its change events tell of changes
// this battery never has: a listener of ours, the first on the battery (it
// is added as getBattery() hands the battery over, before the page can
// have it), stops each one before the page's listeners and handlers. What
// is added, and getBattery() itself, is called from the page's realm (see
// `outside`): a listener added from this script's realm, which is gone
// once the page runs, would never be called. Not in Noor Android, whose
// phones have a battery of their own (scripts/parts/android.js), nor Noor
// iPhone, whose Safari has none.
if (!config.android && !config.iphone) {
  const Battery = window.BatteryManager;
  const proto = Battery && Battery.prototype;
  const navigatorProto = window.Navigator && window.Navigator.prototype;
  if (proto && navigatorProto && typeof navigatorProto.getBattery === "function") {
    const values = { charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1 };
    for (const name of Object.keys(values)) defineGetter(proto, name, () => values[name]);
    const EVENTS = ["chargingchange", "chargingtimechange", "dischargingtimechange", "levelchange"];
    const stopImmediate = window.Event && window.Event.prototype.stopImmediatePropagation;
    const addListener = window.EventTarget && window.EventTarget.prototype.addEventListener;
    const thenOf = window.Promise && window.Promise.prototype.then;
    const quieted = new WeakSet();
    // Only the browser's own (trusted) events: one a page sends itself
    // reaches its listeners, as in Chrome.
    const stop = (event) => {
      try { if (event && event.isTrusted === true) stopImmediate.call(event); } catch (e) {}
    };
    const ignore = () => {};
    const quiet = (battery) => {
      if (!battery || typeof battery !== "object" || quieted.has(battery) || !stopImmediate || !addListener) return;
      quieted.add(battery);
      for (const type of EVENTS) {
        try {
          if (outside) outside.apply(addListener, battery, [type, outside.callback(stop, null), false]);
          else addListener.call(battery, type, stop, false);
        } catch (e) {}
      }
    };
    define(navigatorProto, "getBattery", (original) => function () {
      const promise = outside ? outside.apply(original, this, arguments) : original.apply(this, arguments);
      try {
        if (promise && thenOf) {
          // (A refusal is the page's to see; this side of it is caught, so
          // it adds no unhandled rejection of its own.)
          if (outside) outside.apply(thenOf, promise, [outside.callback(quiet, null), outside.callback(ignore, null)]);
          else thenOf.call(promise, quiet, ignore);
        }
      } catch (e) {}
      return promise;
    });
  }
}
