// The objects, lists and functions made here are given the page's own
// prototypes: this script may run from a realm of its own (see `hosted`),
// whose objects a page would tell from its own (instanceof, constructor).
const own = (value) => setPrototypeOf(value, Array.isArray(value) ? window.Array.prototype : window.Object.prototype);
const ownPlainFunction = (impl) => {
  const fn = plainFunction(impl);
  setPrototypeOf(fn, window.Function.prototype);
  own(fn.prototype);
  return fn;
};
// What a page gives is read once, as the browser reads it (WebIDL: a
// string through ToString, a sequence through its iterator, a dictionary's
// members in alphabetical order), and what is made here is made from that.
const readText = (value) => `${value}`;
const readSequence = (value, read) => {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    throw new TypeError("The provided value cannot be converted to a sequence.");
  }
  const iterator = value[Symbol.iterator];
  if (typeof iterator !== "function") {
    throw new TypeError("The object must have a callable @@iterator property.");
  }
  const list = [];
  for (const item of { [Symbol.iterator]: () => iterator.call(value) }) list.push(read(item));
  return list;
};
const readDictionary = (value, type, members) => {
  const out = {};
  if (value === undefined || value === null) return out;
  if (typeof value !== "object" && typeof value !== "function") {
    throw new TypeError("The provided value is not of type '" + type + "'.");
  }
  for (const [name, read] of members) {
    const member = value[name];
    if (member !== undefined) out[name] = read(member);
  }
  return out;
};
const navigatorUserAgentGet = window.Navigator ? getOwnPropertyDescriptor(window.Navigator.prototype, "userAgent").get : null;
const isNavigator = (self) => Boolean(navigatorUserAgentGet) && isA(navigatorUserAgentGet, self);

// A callback the browser would call once its answer came, called the same
// way: after the call that asked returns, with no `this`, and an error it
// throws reported as the page's own uncaught errors are. The promises are
// the page's, made and followed with the functions as they were before the
// page's first script, as the browser makes its own without asking the
// page's (a page that replaced Promise.resolve or then sees no call).
const reflectApply = Reflect.apply;
const PagePromise = window.Promise;
const promiseResolve = PagePromise.resolve;
const promiseReject = PagePromise.reject;
const promiseThen = PagePromise.prototype.then;
const resolved = (value) => reflectApply(promiseResolve, PagePromise, [value]);
const rejected = (error) => reflectApply(promiseReject, PagePromise, [error]);
const report = typeof window.reportError === "function" ? window.reportError : null;
const callLater = (callback, value) => {
  reflectApply(promiseThen, resolved(value), [(answer) => {
    try {
      reflectApply(callback, undefined, [answer]);
    } catch (error) {
      if (report) reflectApply(report, window, [error]);
    }
  }]);
};

// Chrome: pages see Google Chrome's brands in navigator.userAgentData, as
// the user agent and the request headers say, not Chromium's own.
{
  const data = window.navigator.userAgentData;
  const chrome = config.chrome;
  // Already Chrome's (the override set for the tab, see main/tabs.js):
  // then nothing here is replaced.
  const saysChrome = (list) => {
    try {
      return list.length === chrome.brands.length && list.every((b, i) => b.brand === chrome.brands[i].brand && b.version === chrome.brands[i].version);
    } catch (e) {
      return false;
    }
  };
  if (data && chrome && chrome.brands && !saysChrome(data.brands)) {
    const proto = getPrototypeOf(data);
    const copy = (list) => own(list.map((b) => own({ brand: b.brand, version: b.version })));
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
// which Chromium without Chrome's parts leaves empty, as Chrome has them:
// loadTimes and csi plain unnamed functions, chrome.app's members in
// Chrome's order, and the values read from the page's own load (its
// protocol, its first paint).
{
  const chromeObject = window.chrome;
  if (chromeObject && typeof chromeObject === "object" && !("app" in chromeObject)) {
    const performance = window.performance;
    const timing = () => (performance && performance.timing) || {};
    const navigation = () => {
      try { return performance.getEntriesByType("navigation")[0] || null; } catch (e) { return null; }
    };
    const seconds = (value) => (value ? value / 1000 : 0);
    const add = (object, name, value) => defineProperty(object, name, { value, writable: true, enumerable: true, configurable: true });
    add(chromeObject, "loadTimes", ownPlainFunction(() => {
      const t = timing();
      const entry = navigation();
      const protocol = (entry && entry.nextHopProtocol) || "";
      const secure = window.location.protocol === "https:";
      let firstPaint = 0;
      try {
        const paint = performance.getEntriesByName("first-paint")[0];
        if (paint) firstPaint = (performance.timeOrigin + paint.startTime) / 1000;
      } catch (e) {}
      return own({
        requestTime: seconds(t.navigationStart),
        startLoadTime: seconds(t.navigationStart),
        commitLoadTime: seconds(t.responseStart),
        finishDocumentLoadTime: seconds(t.domContentLoadedEventEnd),
        finishLoadTime: seconds(t.loadEventEnd),
        firstPaintTime: firstPaint,
        firstPaintAfterLoadTime: 0,
        navigationType: entry && entry.type === "reload" ? "Reload" : entry && entry.type === "back_forward" ? "BackForward" : "Other",
        wasFetchedViaSpdy: protocol === "h2" || protocol.indexOf("h3") === 0 || protocol === "quic",
        wasNpnNegotiated: secure && Boolean(protocol),
        npnNegotiatedProtocol: secure && protocol ? protocol : "unknown",
        wasAlternateProtocolAvailable: false,
        connectionInfo: protocol || "http/1.1",
      });
    }));
    add(chromeObject, "csi", ownPlainFunction(() => {
      const t = timing();
      return own({
        startE: t.navigationStart || now(),
        onloadT: t.loadEventEnd || t.domContentLoadedEventEnd || 0,
        pageT: performance ? performance.now() : 0,
        tran: 15,
      });
    }));
    const app = own({});
    add(app, "isInstalled", false);
    add(app, "getDetails", method("getDetails", 0, () => null));
    add(app, "getIsInstalled", method("getIsInstalled", 0, () => false));
    add(app, "installState", method("installState", 0, function (callback) {
      if (typeof callback === "function") callLater(callback, "not_installed");
    }));
    add(app, "runningState", method("runningState", 0, () => "cannot_run"));
    add(app, "InstallState", own({ DISABLED: "disabled", INSTALLED: "installed", NOT_INSTALLED: "not_installed" }));
    add(app, "RunningState", own({ CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" }));
    add(chromeObject, "app", app);
  }
}

// Permissions: pages see what a fresh Chrome shows. What Chrome grants
// without asking (sensors, background sync, wake lock…) the app grants too
// (see main.js); what Chrome would ask about (camera, location,
// notifications…) the app refuses, as a user who says no to every site,
// so these read as not asked yet ("prompt", Notification.permission
// "default"), and asking leaves them so.
{
  const ASKS = new Set(["notifications", "push", "camera", "microphone", "geolocation", "clipboard-read", "display-capture",
    "idle-detection", "local-fonts", "midi", "persistent-storage", "window-management", "captured-surface-control", "storage-access"]);
  // A status names some permissions as Chromium does inside
  // ("video_capture" for the camera…).
  const INNER = { video_capture: "camera", audio_capture: "microphone", durable_storage: "persistent-storage" };
  const asks = (name) => {
    const plain = String(name);
    return ASKS.has(INNER[plain] || plain.replace(/_/g, "-"));
  };
  const Notification = window.Notification;
  if (Notification) {
    defineGetter(Notification, "permission", () => "default");
    define(Notification, "requestPermission", (original) => function (callback) {
      if (typeof callback === "function") callLater(callback, "default");
      return resolved("default");
    });
  }
  const status = window.PermissionStatus && window.PermissionStatus.prototype;
  if (status) {
    defineGetter(status, "state", function (value) {
      return value === "denied" && asks(this.name) ? "prompt" : value;
    });
  }
}

// Voices: Chrome on Windows offers Google's voices beside the system's,
// which Chromium alone doesn't; a site reads the list to tell Chrome from
// the browsers built on it. They are listed after the system's, as in
// Chrome, once those are; one chosen for an utterance speaks with a system
// voice of its language, and reads back as chosen.
{
  const Voice = window.SpeechSynthesisVoice;
  const Synthesis = window.SpeechSynthesis;
  const Utterance = window.SpeechSynthesisUtterance;
  if (Voice && Synthesis && Utterance) {
    const GOOGLE = [
      ["Google Deutsch", "de-DE"], ["Google US English", "en-US"], ["Google UK English Female", "en-GB"],
      ["Google UK English Male", "en-GB"], ["Google español", "es-ES"], ["Google español de Estados Unidos", "es-US"],
      ["Google français", "fr-FR"], ["Google हिन्दी", "hi-IN"], ["Google Bahasa Indonesia", "id-ID"],
      ["Google italiano", "it-IT"], ["Google 日本語", "ja-JP"], ["Google 한국의", "ko-KR"], ["Google Nederlands", "nl-NL"],
      ["Google polski", "pl-PL"], ["Google português do Brasil", "pt-BR"], ["Google русский", "ru-RU"],
      ["Google 普通话（中国大陆）", "zh-CN"], ["Google 粤語（香港）", "zh-HK"], ["Google 國語（臺灣）", "zh-TW"],
    ];
    const fakes = new WeakMap();
    let google = null;
    const googleVoices = () => google || (google = GOOGLE.map(([name, lang]) => {
      const voice = Object.create(Voice.prototype);
      fakes.set(voice, { name, lang });
      return voice;
    }));
    const values = { voiceURI: (d) => d.name, name: (d) => d.name, lang: (d) => d.lang, localService: () => false, default: () => false };
    for (const name of Object.keys(values)) {
      const descriptor = getOwnPropertyDescriptor(Voice.prototype, name);
      if (!descriptor || !descriptor.get) continue;
      const read = values[name];
      defineProperty(Voice.prototype, name, {
        get: lookalike(descriptor.get, function () {
          const fake = fakes.get(this);
          return fake ? read(fake) : descriptor.get.call(this);
        }),
        set: descriptor.set,
        configurable: true,
        enumerable: descriptor.enumerable,
      });
    }
    let systemVoices = () => [];
    define(Synthesis.prototype, "getVoices", (original) => {
      systemVoices = (synthesis) => original.call(synthesis);
      return function () {
        const voices = original.apply(this, arguments);
        return voices.length ? voices.concat(googleVoices()) : voices;
      };
    });
    const voiceDescriptor = getOwnPropertyDescriptor(Utterance.prototype, "voice");
    if (voiceDescriptor && voiceDescriptor.get && voiceDescriptor.set) {
      const chosen = new WeakMap();
      const langOf = getOwnPropertyDescriptor(Voice.prototype, "lang");
      defineProperty(Utterance.prototype, "voice", {
        get: lookalike(voiceDescriptor.get, function () {
          const voice = voiceDescriptor.get.call(this);
          const pick = chosen.get(this);
          return pick && voice === pick.stand ? pick.fake : voice;
        }),
        set: lookalike(voiceDescriptor.set, function (value) {
          const fake = value && fakes.get(value);
          if (!fake) {
            chosen.delete(this);
            return voiceDescriptor.set.call(this, value);
          }
          let stand = null;
          try {
            const local = systemVoices(window.speechSynthesis).filter((v) => !fakes.has(v));
            const lang = (v) => String(langOf.get.call(v));
            stand = local.find((v) => lang(v) === fake.lang) || local.find((v) => lang(v).split("-")[0] === fake.lang.split("-")[0]) || null;
          } catch (e) {}
          voiceDescriptor.set.call(this, stand);
          chosen.set(this, { fake: value, stand });
        }),
        configurable: true,
        enumerable: voiceDescriptor.enumerable,
      });
    }
  }
}

// Widevine: Chrome on Windows always has it, Chromium alone doesn't, and a
// site asks for it to tell them apart. A request for it is answered as
// Chrome's Widevine answers (the same configurations accepted, refused and
// reported back: software robustness levels, persistent state, no
// "keyids"), with a working ClearKey system behind it, so the media keys
// and sessions it gives are real ones. Protected films still won't play,
// as before.
{
  const navigatorProto = window.Navigator && window.Navigator.prototype;
  const Access = window.MediaKeySystemAccess;
  if (navigatorProto && Access && typeof navigatorProto.requestMediaKeySystemAccess === "function") {
    const WIDEVINE = "com.widevine.alpha";
    const SOFTWARE = new Set(["", "SW_SECURE_CRYPTO", "SW_SECURE_DECODE"]);
    // Each access given for Widevine: what was asked, config by config.
    const asked = new WeakMap();
    const toClearKey = (config, index) => {
      if (!config || typeof config !== "object") return null;
      const out = {};
      for (const key of Object.keys(config)) out[key] = config[key];
      out.label = String(index);
      if (Array.isArray(config.initDataTypes)) {
        const types = config.initDataTypes.map(String).filter((type) => type !== "keyids");
        if (config.initDataTypes.length && !types.length) return null;
        out.initDataTypes = types;
      }
      if (config.sessionTypes !== undefined) {
        const types = Array.from(config.sessionTypes || [], String);
        if (types.some((type) => type !== "temporary")) return null;
      }
      if (config.distinctiveIdentifier === "required") return null;
      if (config.persistentState === "required") out.persistentState = "optional";
      const kept = {};
      for (const kind of ["audioCapabilities", "videoCapabilities"]) {
        if (config[kind] === undefined) continue;
        const list = Array.from(config[kind] || []);
        const supported = list.filter((cap) => cap && SOFTWARE.has(cap.robustness === undefined ? "" : String(cap.robustness)));
        if (list.length && !supported.length) return null;
        kept[kind] = supported;
        out[kind] = supported.map((cap) => {
          const copy = {};
          for (const key of Object.keys(cap)) copy[key] = cap[key];
          copy.robustness = "";
          return copy;
        });
      }
      return { config: out, original: config, kept };
    };
    const REQUIREMENTS = ["required", "optional", "not-allowed"];
    const readRequirement = (value) => {
      const text = readText(value);
      if (REQUIREMENTS.indexOf(text) === -1) {
        throw new TypeError("The provided value '" + text + "' is not a valid enum value of type MediaKeysRequirement.");
      }
      return text;
    };
    const readCapabilities = (value) => readSequence(value, (item) => readDictionary(item, "MediaKeySystemMediaCapability", [
      ["contentType", readText], ["encryptionScheme", (v) => (v === null ? null : readText(v))], ["robustness", readText],
    ]));
    const readConfiguration = (value) => readDictionary(value, "MediaKeySystemConfiguration", [
      ["audioCapabilities", readCapabilities], ["distinctiveIdentifier", readRequirement],
      ["initDataTypes", (v) => readSequence(v, readText)], ["label", readText], ["persistentState", readRequirement],
      ["sessionTypes", (v) => readSequence(v, readText)], ["videoCapabilities", readCapabilities],
    ]);
    define(navigatorProto, "requestMediaKeySystemAccess", (original) => function (keySystem, configs) {
      if (arguments.length < 2 || !isNavigator(this)) return original.apply(this, arguments);
      let key, list;
      try {
        key = readText(keySystem);
        if (key !== WIDEVINE) return original.call(this, key, configs);
        list = readSequence(configs, readConfiguration);
      } catch (error) {
        return rejected(pageError(error));
      }
      const mapped = list.map(toClearKey);
      const usable = mapped.filter(Boolean);
      // Asked for nothing, or nothing Widevine would take: refused as Chrome refuses it.
      if (!usable.length) return original.call(this, key, list);
      return original.call(this, "org.w3.clearkey", usable.map((m) => m.config)).then((access) => {
        const chosen = mapped[Number(access.getConfiguration().label)];
        asked.set(access, chosen);
        return access;
      });
    });
    defineGetter(Access.prototype, "keySystem", function (value) {
      return asked.has(this) ? WIDEVINE : value;
    });
    define(Access.prototype, "getConfiguration", (original) => function () {
      const result = original.apply(this, arguments);
      const chosen = asked.get(this);
      if (!chosen) return result;
      const label = chosen.original.label;
      result.label = label === undefined ? "" : String(label);
      if (chosen.original.persistentState === "required") result.persistentState = "required";
      for (const kind of ["audioCapabilities", "videoCapabilities"]) {
        const wanted = (chosen.kept[kind] || []).slice();
        for (const cap of result[kind] || []) {
          const index = wanted.findIndex((w) => String(w.contentType) === cap.contentType);
          if (index === -1) continue;
          cap.robustness = wanted[index].robustness === undefined ? "" : String(wanted[index].robustness);
          wanted.splice(index, 1);
        }
      }
      return result;
    });
  }
}

// Web Share, which Chrome on Windows has: nothing here to share with, so a
// share is refused as a user who closed the dialog.
{
  const proto = window.Navigator && window.Navigator.prototype;
  if (proto && !("share" in proto) && window.DOMException) {
    const checkThis = (self) => {
      if (!isNavigator(self)) throw new window.TypeError("Illegal invocation");
    };
    const readShareData = (value) => readDictionary(value, "ShareData", [
      ["files", (v) => readSequence(v, (file) => file)], ["text", readText], ["title", readText], ["url", readText],
    ]);
    const shareable = (data) => data.title !== undefined || data.text !== undefined || data.url !== undefined || Boolean(data.files && data.files.length);
    const add = (name, fn) => defineProperty(proto, name, { value: fn, writable: true, enumerable: true, configurable: true });
    add("canShare", method("canShare", 0, function (value) {
      checkThis(this);
      const data = readShareData(value);
      if (!shareable(data)) return false;
      if (data.url !== undefined) {
        try { new window.URL(String(data.url), window.location.href); } catch (e) { return false; }
      }
      return true;
    }));
    add("share", method("share", 0, function (value) {
      let data;
      try {
        checkThis(this);
        data = readShareData(value);
      } catch (error) {
        return rejected(pageError(error));
      }
      if (!shareable(data)) {
        return rejected(new window.TypeError("Failed to execute 'share' on 'Navigator': Must specify at least one of title, text, url, or files"));
      }
      const active = window.navigator.userActivation && window.navigator.userActivation.isActive;
      if (!active) {
        return rejected(new window.DOMException("Failed to execute 'share' on 'Navigator': Must be handling a user gesture to perform a share request.", "NotAllowedError"));
      }
      return rejected(new window.DOMException("Share canceled", "AbortError"));
    }));
  }
}
