// Noor Android: what a page sees of the browser is Chrome on the profile's
// Android phone or tablet (config.android, see main/android.js). Chromium
// already shows the device's screen, pixel density and touch, and Chrome's
// user agent and client hints, in the tab (see Tab.emulate); this does the
// rest a site reads to tell Chrome on an Android device from Chrome on a
// PC: the platform and client hints where no tab's override reaches (a
// shared or service worker), no plugins, the device's graphics card,
// voices and fonts, its network, battery and Contact Picker, and what
// Chrome on Android lacks. In a worker as in a window.
{
  const device = config.android;
  const isWindow = Boolean(document) && typeof window.Window === "function";
  const PagePromise = window.Promise;
  const resolvedWith = (value) => Reflect.apply(PagePromise.resolve, PagePromise, [value]);
  const rejectedWith = (error) => Reflect.apply(PagePromise.reject, PagePromise, [error]);
  const PageException = window.DOMException;
  const PageTypeError = window.TypeError;
  const userActive = () => {
    try { return Boolean(window.navigator.userActivation && window.navigator.userActivation.isActive); } catch (e) { return false; }
  };
  // A replacement made over another one stands for the browser's own
  // function, as the first one does (see scripts/parts/iphone.js).
  const deepest = (fn) => {
    let found = fn;
    for (let i = 0; i < 8 && originals.has(found); i++) found = originals.get(found);
    return found;
  };
  const rebase = (fn) => {
    if (typeof fn === "function" && originals.has(fn)) originals.set(fn, deepest(originals.get(fn)));
  };
  const redefine = (object, name, make) => {
    define(object, name, make);
    rebase(object && object[name]);
  };
  const regetter = (object, name, get) => {
    defineGetter(object, name, get);
    const descriptor = object && getOwnPropertyDescriptor(object, name);
    if (descriptor) rebase(descriptor.get);
  };
  const addGetter = (object, name, get, enumerable = true) => {
    if (!object || Object.prototype.hasOwnProperty.call(object, name)) return;
    defineProperty(object, name, { get: method("get " + name, 0, get), enumerable, configurable: true });
  };
  const addMethod = (object, name, length, impl, enumerable = true) => {
    if (!object || Object.prototype.hasOwnProperty.call(object, name)) return;
    defineProperty(object, name, { value: method(name, length, impl), writable: true, enumerable, configurable: true });
  };
  // An event handler property for events this browser never sends: it
  // keeps what it is given, as one does.
  const handlerValues = new WeakMap();
  const addHandler = (object, name) => {
    if (!object || Object.prototype.hasOwnProperty.call(object, name)) return;
    defineProperty(object, name, {
      get: method("get " + name, 0, function () {
        const values = handlerValues.get(this);
        return (values && values[name]) || null;
      }),
      set: method("set " + name, 1, function (value) {
        let values = handlerValues.get(this);
        if (!values) handlerValues.set(this, (values = {}));
        values[name] = typeof value === "function" || (value && typeof value === "object") ? value : null;
      }),
      enumerable: true,
      configurable: true,
    });
  };
  const arrayOf = (list) => setPrototypeOf(list, window.Array.prototype);
  const objectOf = (value) => setPrototypeOf(value, window.Object.prototype);

  // The navigator: Android's platform ("Linux aarch64" from 64-bit Chrome,
  // "Linux armv8l" from the 32-bit one), Chrome on Android's user agent in
  // every worker too, and no plugins: Chrome on Android shows a PDF in no
  // page, so it lists none.
  const navigatorProto = (window.Navigator || window.WorkerNavigator).prototype;
  {
    regetter(navigatorProto, "platform", () => device.platform);
    if (device.userAgent) {
      defineGetter(navigatorProto, "userAgent", () => device.userAgent);
      defineGetter(navigatorProto, "appVersion", () => device.userAgent.replace(/^Mozilla\//, ""));
    }
    if (window.Navigator) {
      regetter(navigatorProto, "pdfViewerEnabled", () => false);
      // The page's own empty lists, of the browser's own kinds: what reads
      // them on these answers as on an empty list, the rest as before.
      const empty = new WeakSet();
      const emptyOf = (Type) => {
        const made = Object.create(Type.prototype);
        empty.add(made);
        return made;
      };
      for (const [name, Type] of [["plugins", window.PluginArray], ["mimeTypes", window.MimeTypeArray]]) {
        if (!Type) continue;
        const list = emptyOf(Type);
        const own = getOwnPropertyDescriptor(navigatorProto, name);
        if (!own || !own.get) continue;
        defineProperty(navigatorProto, name, { get: lookalike(own.get, function () { own.get.call(this); return list; }), set: own.set, enumerable: own.enumerable, configurable: true });
        rebase(getOwnPropertyDescriptor(navigatorProto, name).get);
        const proto = Type.prototype;
        const length = getOwnPropertyDescriptor(proto, "length");
        if (length && length.get) {
          defineProperty(proto, "length", { get: lookalike(length.get, function () { return empty.has(this) ? 0 : length.get.call(this); }), set: length.set, enumerable: length.enumerable, configurable: true });
        }
        for (const member of ["item", "namedItem"]) {
          redefine(proto, member, (original) => function () {
            if (!empty.has(this)) return original.apply(this, arguments);
            if (!arguments.length) throw new PageTypeError(`Failed to execute '${member}' on '${Type.name}': 1 argument required, but only 0 present.`);
            return null;
          });
        }
        redefine(proto, "refresh", (original) => function () {
          return empty.has(this) ? undefined : original.apply(this, arguments);
        });
        if (typeof proto[Symbol.iterator] === "function") {
          const values = proto[Symbol.iterator];
          defineProperty(proto, Symbol.iterator, {
            value: lookalike(values, function () { return empty.has(this) ? window.Array.prototype.values.call(arrayOf([])) : values.apply(this, arguments); }),
            writable: true,
            enumerable: false,
            configurable: true,
          });
        }
      }
    }
  }

  // Client hints where no tab's override reached (a shared or service
  // worker, a frame of its own): Android, the device's model and version,
  // a phone or not, as Chrome on the device tells them.
  {
    const data = window.navigator.userAgentData;
    const metadata = device.metadata;
    if (data && metadata && data.platform !== "Android") {
      const proto = getPrototypeOf(data);
      const copy = (list) => arrayOf(list.map((b) => objectOf({ brand: b.brand, version: b.version })));
      regetter(proto, "platform", () => "Android");
      regetter(proto, "mobile", () => Boolean(metadata.mobile));
      redefine(proto, "getHighEntropyValues", (original) => function (hints) {
        return original.apply(this, arguments).then((values) => {
          values.platform = "Android";
          values.mobile = Boolean(metadata.mobile);
          if ("architecture" in values) values.architecture = metadata.architecture;
          if ("bitness" in values) values.bitness = metadata.bitness;
          if ("model" in values) values.model = metadata.model;
          if ("platformVersion" in values) values.platformVersion = metadata.platformVersion;
          if ("wow64" in values) values.wow64 = false;
          if ("formFactors" in values) values.formFactors = arrayOf(metadata.formFactors.slice());
          if ("fullVersionList" in values) values.fullVersionList = copy(metadata.fullVersionList);
          if ("brands" in values) values.brands = copy(metadata.brands);
          return values;
        });
      });
      redefine(proto, "toJSON", (original) => function () {
        const values = original.apply(this, arguments);
        values.platform = "Android";
        values.mobile = Boolean(metadata.mobile);
        values.brands = copy(metadata.brands);
        return values;
      });
    }
  }

  // The window: Chrome's on the device, the screen less the status bar.
  if (isWindow) {
    defineGetter(window, "outerWidth", () => device.outerWidth);
    defineGetter(window, "outerHeight", () => device.outerHeight);
  }

  // HDR screens answer the dynamic-range queries, which Chromium doesn't
  // stand in for.
  if (isWindow && window.MediaQueryList) {
    const written = new WeakMap();
    const DYNAMIC = /\(\s*(video-)?dynamic-range\s*:\s*high\s*\)/gi;
    const windowSelf = (getOwnPropertyDescriptor(window, "self") || {}).get;
    redefine(window, "matchMedia", (original) => function (query) {
      if (!arguments.length || (this != null && windowSelf && !isA(windowSelf, this))) return original.apply(this, arguments);
      const text = `${query}`;
      const rewritten = text.replace(DYNAMIC, device.hdr ? "(min-width: 0px)" : "(min-width: 99999px)");
      const list = original.call(this, rewritten);
      if (rewritten !== text) {
        try { written.set(list, text); } catch (e) {}
      }
      return list;
    });
    regetter(window.MediaQueryList.prototype, "media", function (value) {
      return written.get(this) || value;
    });
  }

  // The network: Chrome on Android tells its kind (Wi-Fi here) and the
  // most it can carry.
  {
    const info = window.NetworkInformation && window.NetworkInformation.prototype;
    if (info) {
      addGetter(info, "type", () => "wifi");
      addGetter(info, "downlinkMax", () => Infinity);
      addHandler(info, "ontypechange");
    }
  }

  // The battery: a phone's, not on its charger all day (the level and
  // whether it charges are the profile's own, see main.js).
  {
    const battery = device.battery;
    const proto = window.BatteryManager && window.BatteryManager.prototype;
    if (battery && proto) {
      regetter(proto, "charging", () => battery.charging);
      regetter(proto, "level", () => battery.level);
      regetter(proto, "chargingTime", () => (battery.charging ? Math.round((1 - battery.level) * 7200) : Infinity));
      regetter(proto, "dischargingTime", () => (battery.charging ? Infinity : Math.round(battery.level * 36000)));
    }
  }

  // The Contact Picker, Chrome on Android's own: asked without a tap it is
  // refused; with one, as by a user who closes the list.
  if (isWindow && window.Navigator && window.EventTarget && !("contacts" in navigatorProto)) {
    const Contacts = nativeClass("ContactsManager", window.Object);
    setPrototypeOf(Contacts, window.Function.prototype);
    const PROPERTIES = ["address", "email", "icon", "name", "tel"];
    addMethod(Contacts.prototype, "getProperties", 0, () => resolvedWith(arrayOf(PROPERTIES.slice())));
    addMethod(Contacts.prototype, "select", 1, function (properties) {
      if (!arguments.length) return rejectedWith(new PageTypeError("Failed to execute 'select' on 'ContactsManager': 1 argument required, but only 0 present."));
      if (!userActive()) return rejectedWith(new PageException("A user gesture is required to call this method", "SecurityError"));
      return resolvedWith(arrayOf([]));
    });
    let contacts = null;
    addGetter(navigatorProto, "contacts", () => contacts || (contacts = Object.create(Contacts.prototype)));
  }

  // WebGL: the graphics card of the device's processor as Chrome on it
  // tells it (once the page asked for WEBGL_debug_renderer_info, as Chrome
  // wants), its limits (or this card's where it allows less, so a page that
  // goes by them still draws), and no texture formats only a PC's cards
  // read. WebGPU: the same card's maker and family. All of it unless the
  // profile's WebGL Vendor & Renderer is off: then this PC's own card.
  if (device.graphics) {
    const graphics = device.graphics;
    const PC_ONLY = new Set(["webgl_compressed_texture_s3tc", "webgl_compressed_texture_s3tc_srgb", "ext_texture_compression_bptc", "ext_texture_compression_rgtc"]);
    const mali = graphics.family === "mali";
    const LIMITS = mali
      ? { 0x0D33: 8192, 0x851C: 8192, 0x84E8: 8192, 0x8869: 16, 0x8DFB: 256, 0x8DFD: 256, 0x8DFC: 15, 0x8872: 16, 0x8B4C: 16, 0x8B4D: 32 }
      : { 0x0D33: 16384, 0x851C: 16384, 0x84E8: 16384, 0x8869: 32, 0x8DFB: 256, 0x8DFD: 256, 0x8DFC: 31, 0x8872: 16, 0x8B4C: 16, 0x8B4D: 32 };
    const VIEWPORT = mali ? 8192 : 16384;
    const POINTS = mali ? 1024 : 1023;
    const patch = (Context) => {
      const proto = Context && Context.prototype;
      if (!proto) return;
      const debugInfo = new WeakSet();
      redefine(proto, "getSupportedExtensions", (original) => function () {
        const list = original.apply(this, arguments);
        return list ? arrayOf(Array.prototype.filter.call(list, (name) => !PC_ONLY.has(String(name).toLowerCase()))) : list;
      });
      redefine(proto, "getExtension", (original) => function (name) {
        if (!arguments.length) return original.apply(this, arguments);
        const text = `${name}`;
        if (PC_ONLY.has(text.toLowerCase())) return null;
        const extension = original.call(this, text);
        if (extension && text.toLowerCase() === "webgl_debug_renderer_info") debugInfo.add(this);
        return extension;
      });
      redefine(proto, "getParameter", (original) => function (pname) {
        if (!arguments.length) return original.apply(this, arguments);
        const value = original.apply(this, arguments);
        const p = +pname;
        if (p === 0x9245) return value === null || !debugInfo.has(this) ? value : graphics.vendor;
        if (p === 0x9246) return value === null || !debugInfo.has(this) ? value : graphics.renderer;
        if (p === 0x0D3A && value && typeof value.length === "number") return new window.Int32Array([min(value[0], VIEWPORT), min(value[1], VIEWPORT)]);
        if (p === 0x846D && value && typeof value.length === "number") return new window.Float32Array([1, min(value[1], POINTS)]);
        const limit = LIMITS[p];
        if (limit !== undefined && typeof value === "number") return min(value, limit);
        return value;
      });
    };
    patch(window.WebGLRenderingContext);
    patch(window.WebGL2RenderingContext);

    // WebGPU (an adapter's info, and a device's): the card's maker and
    // family, no model or description (as Chrome tells neither), and the
    // width its subgroups run at.
    const told = { vendor: graphics.webgpu.vendor, architecture: graphics.webgpu.architecture, device: "", description: "", subgroupMinSize: graphics.webgpu.subgroupMinSize, subgroupMaxSize: graphics.webgpu.subgroupMaxSize };
    const nameInfo = () => {
      const infoProto = window.GPUAdapterInfo && window.GPUAdapterInfo.prototype;
      if (!infoProto) return false;
      // (The browser's getter still runs first, and refuses what isn't
      // an adapter's info.)
      for (const name of Object.keys(told)) regetter(infoProto, name, () => told[name]);
      // The canvas format Chrome on Android prefers is RGBA (Chromium on
      // Windows answers BGRA); a page that takes it still draws, as both
      // are formats a canvas takes.
      const gpuProto = window.GPU && window.GPU.prototype;
      if (gpuProto) {
        redefine(gpuProto, "getPreferredCanvasFormat", (original) => function () {
          original.apply(this, arguments);
          return "rgba8unorm";
        });
      }
      return true;
    };
    // A worker gets WebGPU (as what a secure context alone has) only after
    // this script ran, as its own script is about to run: then it is named
    // (see lateTasks).
    if (!nameInfo()) lateTasks.push(nameInfo);
  }

  // Voices: Chrome on Android lists one for each language and country the
  // system's speech engine speaks, named for them, not this PC's (whose
  // names tell Windows). One a page picks speaks with a voice of this PC's
  // of its language, and reads back as picked.
  {
    const Voice = window.SpeechSynthesisVoice;
    const Synthesis = window.SpeechSynthesis;
    const Utterance = window.SpeechSynthesisUtterance;
    if (Voice && Synthesis && Utterance) {
      const LANGUAGES = [
        ["Arabic", "ar"], ["Bangla Bangladesh", "bn-BD"], ["Bangla India", "bn-IN"], ["Catalan Spain", "ca-ES"], ["Czech Czechia", "cs-CZ"],
        ["Danish Denmark", "da-DK"], ["German Germany", "de-DE"], ["Greek Greece", "el-GR"], ["English Australia", "en-AU"],
        ["English United Kingdom", "en-GB"], ["English India", "en-IN"], ["English Nigeria", "en-NG"], ["English United States", "en-US"],
        ["Spanish Spain", "es-ES"], ["Spanish United States", "es-US"], ["Estonian Estonia", "et-EE"], ["Finnish Finland", "fi-FI"],
        ["Filipino Philippines", "fil-PH"], ["French Canada", "fr-CA"], ["French France", "fr-FR"], ["Gujarati India", "gu-IN"],
        ["Hindi India", "hi-IN"], ["Croatian Croatia", "hr-HR"], ["Hungarian Hungary", "hu-HU"], ["Indonesian Indonesia", "id-ID"],
        ["Italian Italy", "it-IT"], ["Japanese Japan", "ja-JP"], ["Javanese Indonesia", "jv-ID"], ["Khmer Cambodia", "km-KH"],
        ["Kannada India", "kn-IN"], ["Korean South Korea", "ko-KR"], ["Malayalam India", "ml-IN"], ["Marathi India", "mr-IN"],
        ["Malay Malaysia", "ms-MY"], ["Norwegian Bokmål Norway", "nb-NO"], ["Nepali Nepal", "ne-NP"], ["Dutch Belgium", "nl-BE"],
        ["Dutch Netherlands", "nl-NL"], ["Punjabi India", "pa-IN"], ["Polish Poland", "pl-PL"], ["Portuguese Brazil", "pt-BR"],
        ["Portuguese Portugal", "pt-PT"], ["Romanian Romania", "ro-RO"], ["Russian Russia", "ru-RU"], ["Sinhala Sri Lanka", "si-LK"],
        ["Slovak Slovakia", "sk-SK"], ["Albanian Albania", "sq-AL"], ["Serbian Serbia", "sr-RS"], ["Sundanese Indonesia", "su-ID"],
        ["Swedish Sweden", "sv-SE"], ["Swahili Kenya", "sw-KE"], ["Tamil India", "ta-IN"], ["Telugu India", "te-IN"],
        ["Thai Thailand", "th-TH"], ["Turkish Turkey", "tr-TR"], ["Ukrainian Ukraine", "uk-UA"], ["Urdu Pakistan", "ur-PK"],
        ["Vietnamese Vietnam", "vi-VN"], ["Cantonese Hong Kong", "yue-HK"], ["Chinese China", "zh-CN"], ["Chinese Taiwan", "zh-TW"],
      ];
      const language = (config.languages && config.languages[0]) || "en-US";
      const LIST = LANGUAGES.map(([name, lang]) => ({ name, lang }));
      const mine = LIST.find((v) => v.lang === language) || LIST.find((v) => v.lang.split("-")[0] === language.split("-")[0]) || LIST.find((v) => v.lang === "en-US");
      const fakes = new WeakMap();
      let voices = null;
      const deviceVoices = () => voices || (voices = LIST.map((d) => {
        const voice = Object.create(Voice.prototype);
        fakes.set(voice, { name: d.name, lang: d.lang, voiceURI: d.name, isDefault: d === mine });
        return voice;
      }));
      const values = { voiceURI: (d) => d.voiceURI, name: (d) => d.name, lang: (d) => d.lang, localService: () => true, default: (d) => d.isDefault };
      for (const name of Object.keys(values)) {
        const descriptor = getOwnPropertyDescriptor(Voice.prototype, name);
        if (!descriptor || !descriptor.get) continue;
        const read = values[name];
        defineProperty(Voice.prototype, name, {
          get: lookalike(deepest(descriptor.get), function () {
            const fake = fakes.get(this);
            return fake ? read(fake) : descriptor.get.call(this);
          }),
          set: descriptor.set,
          configurable: true,
          enumerable: descriptor.enumerable,
        });
      }
      let systemVoices = () => [];
      redefine(Synthesis.prototype, "getVoices", (original) => {
        systemVoices = (synthesis) => original.call(synthesis);
        return function () {
          original.apply(this, arguments);
          return arrayOf(deviceVoices().slice());
        };
      });
      const voiceDescriptor = getOwnPropertyDescriptor(Utterance.prototype, "voice");
      if (voiceDescriptor && voiceDescriptor.get && voiceDescriptor.set) {
        const chosen = new WeakMap();
        const langOf = getOwnPropertyDescriptor(Voice.prototype, "lang");
        defineProperty(Utterance.prototype, "voice", {
          get: lookalike(deepest(voiceDescriptor.get), function () {
            const voice = voiceDescriptor.get.call(this);
            const pick = chosen.get(this);
            return pick && voice === pick.stand ? pick.fake : voice;
          }),
          set: lookalike(deepest(voiceDescriptor.set), function (value) {
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

  // Fonts: Android's, not this PC's (see scripts/parts/android-fonts.js),
  // with the Noto fonts the profile's Android has (device.fonts: those it
  // has, and those it lacks, see main/android.js). Each page gets a face of
  // its own for every one: a Windows font's, or a missing Noto font's,
  // covers no character, so text asked in it falls through to the next
  // font, as where it isn't installed; an Android font's draws the text
  // with a font of this PC's much like it. A font asked for by name
  // (FontFace's local()) is looked for the same way, and these faces are
  // left out of what the page's own font list shows. This PC's other fonts
  // an Android lacks (device.hiddenFonts, from this computer's own list:
  // see main/main.js) are blocked the same way.
  {
    const profileFonts = device.fonts || { add: [], block: [] };
    const listed = ANDROID_FONTS.block.concat(profileFonts.block);
    const blocked = new Set(listed.map((name) => name.toLowerCase()));
    const hiddenHere = device.hiddenFonts && typeof device.hiddenFonts === "object" ? device.hiddenFonts : {};
    const blockedNames = listed.concat((Array.isArray(hiddenHere.shadow) ? hiddenHere.shadow : []).filter((name) => !blocked.has(String(name).toLowerCase())));
    for (const name of blockedNames) blocked.add(String(name).toLowerCase());
    // Every name local() finds one of them by (full and PostScript names).
    const hiddenNames = new Set((Array.isArray(hiddenHere.local) ? hiddenHere.local : []).map((name) => String(name).toLowerCase()));
    const addedFonts = Object.entries(ANDROID_FONTS.add).concat(profileFonts.add);
    const added = new Map(addedFonts.map(([name, local]) => [name.toLowerCase(), local]));
    // A font's family: its name, or the longest family it is a face of
    // ("Noto Sans Thai Bold" is Noto Sans Thai's, not Noto Sans's).
    const familyOf = (name) => {
      const lower = name.toLowerCase();
      if (blocked.has(lower) || added.has(lower) || hiddenNames.has(lower)) return lower;
      let found = null;
      for (const family of added.keys()) if (lower.indexOf(family + " ") === 0 && (!found || family.length > found.length)) found = family;
      for (const family of blocked) if (lower.indexOf(family + " ") === 0 && (!found || family.length > found.length)) found = family;
      return found;
    };
    const missing = "Noor No Such Font " + String(config.mark || "").slice(0, 6);
    const FALLBACK = ["Arial", "Liberation Sans", "DejaVu Sans"];
    const quoted = (name) => '"' + name.replace(/["\\]/g, "\\$&") + '"';
    const localsFor = (local) => [local].concat(FALLBACK.filter((name) => name !== local)).map((name) => `local(${quoted(name)})`).join(", ");
    const rewrite = (source) => source.replace(/local\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi, (whole, a, b, c) => {
      const name = (a !== undefined ? a : b !== undefined ? b : c).trim();
      const family = familyOf(name);
      if (family === null) return whole;
      return added.has(family) ? localsFor(added.get(family)) : `local(${quoted(missing)})`;
    });
    const RealFontFace = window.FontFace;
    // A document's own font list, read with the browser's getter.
    const fontsOf = isWindow && window.Document && (getOwnPropertyDescriptor(window.Document.prototype, "fonts") || {}).get;
    const FontSet = window.FontFaceSet;
    const fontFaceSetLoadEvent = window.FontFaceSetLoadEvent;
    const ours = new WeakSet();
    if (typeof RealFontFace === "function" && FontSet) {
      const realAdd = FontSet.prototype.add;
      const realDelete = FontSet.prototype.delete;
      const face = (fontSet, family, local, range) => {
        try {
          const made = new RealFontFace(family, localsFor(local), { unicodeRange: range, weight: "1 1000" });
          ours.add(made);
          realAdd.call(fontSet, made);
          const loading = made.load();
          if (loading && typeof loading.catch === "function") loading.catch(() => {});
        } catch (e) {}
      };
      // In each document's font list (the page's, and the one of each page
      // a window kept from its empty start loads later: see eachDocument).
      if (isWindow) {
        eachDocument((each) => {
          const fontSet = fontsOf ? fontsOf.call(each) : each.fonts;
          if (!fontSet) return;
          for (const name of blockedNames) face(fontSet, name, "Arial", "U+10FFFF");
          for (const [name, local] of addedFonts) face(fontSet, name, local, "U+0-10FFFE");
        });
      }

      const FontFace = {
        FontFace: function (family, source) {
          "use strict"; /* noor lookalike */
          if (new.target === undefined) throw new PageTypeError("Failed to construct 'FontFace': Please use the 'new' operator, this DOM object constructor cannot be called as a function.");
          const args = Array.prototype.slice.call(arguments);
          if (args.length >= 2 && !(args[1] && typeof args[1] === "object")) args[1] = rewrite(`${args[1]}`);
          return Reflect.construct(RealFontFace, args, new.target === FontFace ? RealFontFace : new.target);
        },
      }.FontFace;
      setPrototypeOf(FontFace, getPrototypeOf(RealFontFace));
      defineProperty(FontFace, "length", { value: RealFontFace.length });
      defineProperty(FontFace, "prototype", { value: RealFontFace.prototype, writable: false, enumerable: false, configurable: false });
      originals.set(FontFace, deepest(RealFontFace));
      try { defineProperty(RealFontFace.prototype, "constructor", { value: FontFace, writable: true, enumerable: false, configurable: true }); } catch (e) {}
      defineProperty(window, "FontFace", { value: FontFace, writable: true, enumerable: false, configurable: true });

      const proto = FontSet.prototype;
      const valuesOf = proto.values;
      const theirs = (set) => {
        const list = [];
        const iterator = valuesOf.call(set);
        for (let step = iterator.next(); !step.done; step = iterator.next()) if (!ours.has(step.value)) list.push(step.value);
        return list;
      };
      const iterate = (list, kind) => {
        const array = arrayOf(list.map((item) => (kind === "entries" ? arrayOf([item, item]) : item)));
        return window.Array.prototype.values.call(array);
      };
      defineGetter(proto, "size", function () { return theirs(this).length; });
      define(proto, "has", (original) => function (item) {
        return ours.has(item) ? false : original.apply(this, arguments);
      });
      define(proto, "delete", (original) => function (item) {
        return ours.has(item) ? false : original.apply(this, arguments);
      });
      define(proto, "clear", (original) => function () {
        for (const item of theirs(this)) realDelete.call(this, item);
      });
      define(proto, "forEach", (original) => function (callback, thisArg) {
        if (typeof callback !== "function") return original.apply(this, arguments);
        for (const item of theirs(this)) Reflect.apply(callback, thisArg, [item, item, this]);
        return undefined;
      });
      for (const kind of ["values", "keys", "entries"]) {
        if (typeof proto[kind] === "function") define(proto, kind, () => function () { return iterate(theirs(this), kind); });
      }
      if (typeof proto[Symbol.iterator] === "function") {
        defineProperty(proto, Symbol.iterator, { value: proto.values, writable: true, enumerable: false, configurable: true });
      }
      define(proto, "load", (original) => function () {
        const result = original.apply(this, arguments);
        return result && typeof result.then === "function" ? result.then((faces) => arrayOf(Array.prototype.filter.call(faces, (item) => !ours.has(item)))) : result;
      });
      if (fontFaceSetLoadEvent) {
        defineGetter(fontFaceSetLoadEvent.prototype, "fontfaces", (value) => {
          if (!value || typeof value.length !== "number") return value;
          const list = Array.prototype.filter.call(value, (item) => !ours.has(item));
          return list.length === value.length ? value : window.Object.freeze(arrayOf(list));
        });
      }
    }
    // A worker's canvas: a font it is given by name is looked for the same
    // way, and reads back as given.
    if (!isWindow && window.OffscreenCanvasRenderingContext2D) {
      const fontOf = getOwnPropertyDescriptor(window.OffscreenCanvasRenderingContext2D.prototype, "font");
      if (fontOf && fontOf.get && fontOf.set) {
        const asked = new WeakMap();
        const families = (text) => text.replace(/(["'])([^"']+)\1|([^,\s"'][^,"']*)/g, (whole, q, inQuotes, bare) => {
          const name = (inQuotes !== undefined ? inQuotes : bare).trim();
          const family = familyOf(name);
          if (family === null) return whole;
          return added.has(family) ? quoted(added.get(family)) : quoted(missing);
        });
        defineProperty(window.OffscreenCanvasRenderingContext2D.prototype, "font", {
          get: lookalike(deepest(fontOf.get), function () {
            const value = fontOf.get.call(this);
            const mine = asked.get(this);
            return mine && mine.set === value ? mine.asked : value;
          }),
          set: lookalike(deepest(fontOf.set), function (value) {
            const text = `${value}`;
            const at = text.search(/\d(?:[\d.]*)(?:px|pt|em|rem|%|vw|vh|ex|ch)\b(?:\s*\/\s*[^\s]+)?\s+/i);
            const split = at === -1 ? -1 : text.slice(at).search(/\s+/) + at;
            const changed = split > 0 ? text.slice(0, split) + families(text.slice(split)) : text;
            fontOf.set.call(this, changed);
            if (changed !== text) asked.set(this, { asked: text, set: fontOf.get.call(this) });
            else asked.delete(this);
          }),
          configurable: true,
          enumerable: fontOf.enumerable,
        });
      }
    }
  }

  // Last, what Chrome on Android doesn't have (see
  // scripts/parts/android-surface.js): members first, then the globals
  // they hang on.
  {
    const scope = isWindow ? "window" : "worker";
    const takeAway = () => {
      for (const where of Object.keys(ANDROID_SURFACE)) {
        if (where === "window" || where === "worker") continue;
        const dot = where.indexOf(".");
        const owner = window[dot === -1 ? where : where.slice(0, dot)];
        const target = owner && (dot === -1 ? owner : owner.prototype);
        if (!target || (typeof target !== "object" && typeof target !== "function")) continue;
        for (const name of ANDROID_SURFACE[where]) {
          try { delete target[name]; } catch (e) {}
        }
      }
      for (const name of ANDROID_SURFACE[scope] || []) {
        try { delete window[name]; } catch (e) {}
      }
    };
    takeAway();
    // What a worker gets late (what a secure context alone has: Web HID…)
    // is taken away as its own script is about to run (see lateTasks).
    if (!isWindow) lateTasks.push(takeAway);
  }
}
