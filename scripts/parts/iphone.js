// Noor iPhone: what a page sees of the browser is Safari on the profile's
// iPhone (config.iphone, see main/iphone.js). Chromium already shows the
// iPhone's screen, pixel density, touch and Safari's user agent (see
// Tab.emulate); this does the rest a site reads to tell Safari on an
// iPhone from Chrome dressed as one: what Safari has and Chromium doesn't
// (and the other way round, for the iPhone's iOS version), how its
// built-ins print, its error messages and clocks, its graphics card, its
// voices and fonts, and how it answers permission queries. In a worker as
// in a window.
{
  const iphone = config.iphone;
  const isWindow = Boolean(document) && typeof window.Window === "function";
  const compareVersions = (a, b) => {
    const pa = String(a).split(".").map(Number);
    const pb = String(b).split(".").map(Number);
    for (let i = 0; i < max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d;
    }
    return 0;
  };
  const atLeast = (version) => compareVersions(iphone.iOS, version) >= 0;
  const PagePromise = window.Promise;
  const resolvedWith = (value) => Reflect.apply(PagePromise.resolve, PagePromise, [value]);
  const rejectedWith = (error) => Reflect.apply(PagePromise.reject, PagePromise, [error]);
  const PageException = window.DOMException;
  const PageTypeError = window.TypeError;
  const userActive = () => {
    try { return Boolean(window.navigator.userActivation && window.navigator.userActivation.isActive); } catch (e) { return false; }
  };
  // A replacement made over another one (Function.prototype.toString, say,
  // which every window's protection has replaced already) stands for the
  // browser's own function, as the first one does, not for that one.
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
  // An accessor of a built-in's kind for something Chromium lacks.
  const addGetter = (object, name, get, enumerable = true) => {
    if (!object || Object.prototype.hasOwnProperty.call(object, name)) return;
    defineProperty(object, name, { get: method("get " + name, 0, get), enumerable, configurable: true });
  };
  const addMethod = (object, name, length, impl, enumerable = true) => {
    if (!object || Object.prototype.hasOwnProperty.call(object, name)) return;
    defineProperty(object, name, { value: method(name, length, impl), writable: true, enumerable, configurable: true });
  };
  // An interface with no parent: its constructor a function as any.
  const rootClass = (name) => {
    const C = nativeClass(name, window.Object);
    setPrototypeOf(C, window.Function.prototype);
    return C;
  };
  // An event handler property for events this browser never sends (an
  // iPhone's gesture events): it keeps what it is given, as one does.
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

  // What the rest needs from Chromium before it is taken away below.
  const RealMediaSource = window.MediaSource;
  const RealSourceBuffer = window.SourceBuffer;
  const elementProto = window.Element && window.Element.prototype;
  const documentProto = window.Document && window.Document.prototype;
  const requestFullscreen = elementProto && elementProto.requestFullscreen;
  const exitFullscreen = documentProto && documentProto.exitFullscreen;
  const fullscreenElementOf = documentProto && (getOwnPropertyDescriptor(documentProto, "fullscreenElement") || {}).get;
  const addListener = window.EventTarget && window.EventTarget.prototype.addEventListener;
  const dispatch = window.EventTarget && window.EventTarget.prototype.dispatchEvent;
  const PageEvent = window.Event;
  const fontFaceSetLoadEvent = window.FontFaceSetLoadEvent;
  // The font faces made here (see Fonts below).
  const protectedFaces = new WeakSet();

  // Built-ins print as JavaScriptCore prints them: on lines of their own,
  // a getter without "get ", a bound function with its "bound " name
  // ("function name() {\n    [native code]\n}"), which a site reads (the
  // length of eval's source) to tell the engine.
  {
    const V8_NATIVE = /^function ([^]*)\(\) \{ \[native code\] \}$/;
    redefine(window.Function.prototype, "toString", (original) => function () {
      const text = original.apply(this, arguments);
      if (typeof text !== "string") return text;
      const match = V8_NATIVE.exec(text);
      if (!match) return text;
      let name = match[1];
      if (name === "") {
        try {
          const own = getOwnPropertyDescriptor(this, "name");
          if (own && typeof own.value === "string" && own.value.indexOf("bound ") === 0) name = own.value;
        } catch (e) {}
      }
      return "function " + name.replace(/^[gs]et /, "") + "() {\n    [native code]\n}";
    });
  }

  // JavaScriptCore's error message where a site compares one with the
  // engine it expects, and its deeper stacks.
  {
    const PageRangeError = window.RangeError;
    define(window.Number.prototype, "toFixed", (original) => function (digits) {
      try {
        return original.apply(this, arguments);
      } catch (error) {
        if (error instanceof PageRangeError && /^toFixed\(\) digits argument/.test(error.message)) {
          throw new PageRangeError("toFixed() argument must be between 0 and 100");
        }
        throw error;
      }
    });
    try { window.Error.stackTraceLimit = 100; } catch (e) {}
  }

  // Safari keeps its clocks to the millisecond (performance.now(), its
  // time origin, events' time stamps).
  {
    const performanceProto = window.Performance && window.Performance.prototype;
    if (performanceProto) {
      define(performanceProto, "now", (original) => function () {
        const value = original.apply(this, arguments);
        return typeof value === "number" ? floor(value) : value;
      });
      defineGetter(performanceProto, "timeOrigin", (value) => (typeof value === "number" ? floor(value) : value));
    }
    if (window.Event) {
      defineGetter(window.Event.prototype, "timeStamp", (value) => (typeof value === "number" ? floor(value) : value));
    }
  }

  // The navigator: Apple's, the core count Safari reports on any iPhone
  // (WebKit tells 4 below 8 cores), the platform and user agent in every
  // worker too, home-screen state, and Web Share.
  {
    const navigatorProto = (window.Navigator || window.WorkerNavigator).prototype;
    if (window.Navigator) defineGetter(navigatorProto, "vendor", () => "Apple Computer, Inc.");
    regetter(navigatorProto, "hardwareConcurrency", () => 4);
    regetter(navigatorProto, "platform", () => "iPhone");
    if (iphone.userAgent) {
      defineGetter(navigatorProto, "userAgent", () => iphone.userAgent);
      defineGetter(navigatorProto, "appVersion", () => iphone.userAgent.replace(/^Mozilla\//, ""));
    }
    if (window.Navigator) {
      addGetter(navigatorProto, "standalone", () => false);
      if (!("share" in navigatorProto) && window.URL) {
        const readShare = (value) => {
          const data = {};
          if (value === undefined || value === null) return data;
          if (typeof value !== "object" && typeof value !== "function") throw new PageTypeError("Type error");
          for (const key of ["files", "text", "title", "url"]) {
            if (value[key] !== undefined) data[key] = key === "files" ? value[key] : `${value[key]}`;
          }
          return data;
        };
        const shareable = (data) => data.title !== undefined || data.text !== undefined || data.url !== undefined || Boolean(data.files && data.files.length);
        addMethod(navigatorProto, "canShare", 0, function (value) {
          const data = readShare(value);
          if (!shareable(data)) return false;
          if (data.url !== undefined) {
            try { new window.URL(data.url, window.location.href); } catch (e) { return false; }
          }
          return true;
        });
        addMethod(navigatorProto, "share", 0, function (value) {
          let data;
          try { data = readShare(value); } catch (error) { return rejectedWith(error); }
          if (!shareable(data)) return rejectedWith(new PageTypeError("Type error"));
          if (!userActive()) return rejectedWith(new PageException("The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.", "NotAllowedError"));
          // Nothing here to share with: as a user who closed the sheet.
          return rejectedWith(new PageException("Share canceled", "AbortError"));
        });
      }
      // The audio session an iPhone page can set (iOS 16.4).
      if (!("audioSession" in navigatorProto) && window.EventTarget) {
        const Session = nativeClass("AudioSession", window.EventTarget);
        const types = new WeakMap();
        defineProperty(Session.prototype, "type", {
          get: method("get type", 0, function () { return types.get(this) || "auto"; }),
          set: method("set type", 1, function (value) {
            const text = `${value}`;
            if (["auto", "playback", "transient", "transient-solo", "ambient", "play-and-record"].indexOf(text) !== -1) types.set(this, text);
          }),
          enumerable: true,
          configurable: true,
        });
        addGetter(Session.prototype, "state", () => "inactive");
        addHandler(Session.prototype, "onstatechange");
        let session = null;
        addGetter(navigatorProto, "audioSession", () => session || (session = Object.create(Session.prototype)));
      }
    }
  }

  // The window: an iPhone's is the whole screen (WebKit's outer size is
  // its web view's, which Safari lays under its bars).
  if (isWindow) {
    defineGetter(window, "outerWidth", () => iphone.width);
    defineGetter(window, "outerHeight", () => iphone.height);
  }

  // HDR screens (iPhone XS and later, but the XR, 11 and SE) answer the
  // dynamic-range queries, which Chromium doesn't stand in for.
  if (isWindow && window.MediaQueryList) {
    const written = new WeakMap();
    const DYNAMIC = /\(\s*(video-)?dynamic-range\s*:\s*high\s*\)/gi;
    const windowSelf = (getOwnPropertyDescriptor(window, "self") || {}).get;
    redefine(window, "matchMedia", (original) => function (query) {
      if (!arguments.length || (this != null && windowSelf && !isA(windowSelf, this))) return original.apply(this, arguments);
      const text = `${query}`;
      const rewritten = text.replace(DYNAMIC, iphone.hdr ? "(min-width: 0px)" : "(min-width: 99999px)");
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

  // CSS.supports() knows Safari's iPhone-only property, as Safari does.
  if (window.CSS && typeof window.CSS.supports === "function") {
    define(window.CSS, "supports", (original) => function (a, b) {
      if (arguments.length >= 2) {
        const property = `${a}`;
        const value = `${b}`;
        if (/^-webkit-touch-callout$/i.test(property.trim()) && /^(none|default|inherit|initial|unset|revert|revert-layer)$/i.test(value.trim())) return true;
        return original.call(this, property, value);
      }
      if (arguments.length === 1) {
        const condition = `${a}`;
        if (/^\s*\(\s*-webkit-touch-callout\s*:\s*(none|default)\s*\)\s*$/i.test(condition)) return true;
        return original.call(this, condition);
      }
      return original.apply(this, arguments);
    });
  }

  // Motion and orientation ask for leave on an iPhone (iOS 13): asked
  // without a tap it is refused, and with one, as by a user who says no.
  for (const name of ["DeviceMotionEvent", "DeviceOrientationEvent"]) {
    const Type = isWindow && window[name];
    if (Type) {
      const ask = function () {
        if (!userActive()) {
          return rejectedWith(new PageException("Requesting device orientation or motion access requires a user gesture to prompt", "NotAllowedError"));
        }
        return resolvedWith("denied");
      };
      if (typeof Type.requestPermission === "function") redefine(Type, "requestPermission", () => ask);
      else addMethod(Type, "requestPermission", 0, ask);
    }
  }

  // An iPhone shows a video full screen through the video itself (it has
  // no Fullscreen API, taken away below), and tells it so.
  if (isWindow && window.HTMLVideoElement && requestFullscreen) {
    const videoProto = window.HTMLVideoElement.prototype;
    const mediaProto = window.HTMLMediaElement.prototype;
    let shown = null;
    const enter = function () {
      if (!userActive()) {
        throw new PageException("The object is in an invalid state.", "InvalidStateError");
      }
      try {
        const done = requestFullscreen.call(this);
        if (done && typeof done.catch === "function") done.catch(() => {});
      } catch (e) {}
    };
    const leave = function () {
      try {
        if (fullscreenElementOf && fullscreenElementOf.call(document) === this) {
          const done = exitFullscreen.call(document);
          if (done && typeof done.catch === "function") done.catch(() => {});
        }
      } catch (e) {}
    };
    addMethod(videoProto, "webkitEnterFullscreen", 0, enter);
    addMethod(videoProto, "webkitExitFullscreen", 0, leave);
    addMethod(videoProto, "webkitEnterFullScreen", 0, enter);
    addMethod(videoProto, "webkitExitFullScreen", 0, leave);
    addGetter(videoProto, "webkitSupportsFullscreen", () => true);
    addGetter(videoProto, "webkitDisplayingFullscreen", function () {
      try { return Boolean(fullscreenElementOf) && fullscreenElementOf.call(document) === this; } catch (e) { return false; }
    });
    addMethod(videoProto, "webkitSupportsPresentationMode", 1, (mode) => ["inline", "fullscreen", "picture-in-picture"].indexOf(`${mode}`) !== -1);
    addGetter(videoProto, "webkitPresentationMode", function () {
      try { return fullscreenElementOf && fullscreenElementOf.call(document) === this ? "fullscreen" : "inline"; } catch (e) { return "inline"; }
    });
    addMethod(mediaProto, "webkitShowPlaybackTargetPicker", 0, function () {});
    addGetter(mediaProto, "webkitCurrentPlaybackTargetIsWireless", () => false);
    // webkitbeginfullscreen / webkitendfullscreen, as a video gets them.
    if (addListener && dispatch && outside) {
      const changed = () => {
        try {
          const now = fullscreenElementOf.call(document);
          if (shown && shown !== now) {
            const left = shown;
            shown = null;
            dispatch.call(left, new PageEvent("webkitendfullscreen", { bubbles: true }));
          }
          if (now && now !== shown && now instanceof window.HTMLVideoElement) {
            shown = now;
            dispatch.call(now, new PageEvent("webkitbeginfullscreen", { bubbles: true }));
          }
        } catch (e) {}
      };
      try { addListener.call(document, "fullscreenchange", outside.callback(changed, null), true); } catch (e) {}
    }
  }

  // Safari's own interfaces, which a site looks for to tell Safari (the
  // old CSS values, Apple Pay, the old media keys, iPhone gestures).
  if (isWindow) {
    const constants = (C, list) => {
      for (const [name, value] of list) {
        for (const target of [C, C.prototype]) {
          defineProperty(target, name, { value, writable: false, enumerable: true, configurable: false });
        }
      }
    };
    if (!window.CSSValue) {
      const CSSValue = rootClass("CSSValue");
      constants(CSSValue, [["CSS_INHERIT", 0], ["CSS_PRIMITIVE_VALUE", 1], ["CSS_VALUE_LIST", 2], ["CSS_CUSTOM", 3]]);
      const Primitive = nativeClass("CSSPrimitiveValue", CSSValue);
      constants(Primitive, ["CSS_UNKNOWN", "CSS_NUMBER", "CSS_PERCENTAGE", "CSS_EMS", "CSS_EXS", "CSS_PX", "CSS_CM", "CSS_MM", "CSS_IN", "CSS_PT", "CSS_PC", "CSS_DEG", "CSS_RAD", "CSS_GRAD", "CSS_MS", "CSS_S", "CSS_HZ", "CSS_KHZ", "CSS_DIMENSION", "CSS_STRING", "CSS_URI", "CSS_IDENT", "CSS_ATTR", "CSS_COUNTER", "CSS_RECT", "CSS_RGBCOLOR", "CSS_VW", "CSS_VH", "CSS_VMIN", "CSS_VMAX"].map((name, i) => [name, i]));
      nativeClass("CSSValueList", CSSValue);
      rootClass("Counter");
      rootClass("RGBColor");
      rootClass("Rect");
    }
    if (!window.WebKitMediaKeys && window.EventTarget) {
      rootClass("WebKitMediaKeys");
      nativeClass("WebKitMediaKeySession", window.EventTarget);
      nativeClass("WebKitMediaKeyMessageEvent", PageEvent);
      nativeClass("WebKitMediaKeyNeededEvent", PageEvent);
    }
    if (!window.GestureEvent && window.UIEvent) {
      nativeClass("GestureEvent", window.UIEvent);
      for (const target of [window, documentProto, elementProto]) {
        for (const name of ["ongesturechange", "ongestureend", "ongesturestart"]) addHandler(target, name);
      }
    }
    // Apple Pay: ApplePayError always, and on secure pages the session, on
    // an iPhone with no card set up for Apple Pay here.
    if (!window.ApplePayError) {
      const errors = new WeakMap();
      const CODES = ["shippingContactInvalid", "billingContactInvalid", "addressUnserviceable", "couponCodeInvalid", "couponCodeExpired", "unknown"];
      const ApplePayError = {
        ApplePayError: function (errorCode, contactField, message) {
          "use strict"; /* noor lookalike */
          if (new.target === undefined) throw new PageTypeError("Constructor requires 'new' operator");
          const code = `${errorCode}`;
          if (CODES.indexOf(code) === -1) throw new PageTypeError("Type error");
          const self = Object.create((new.target && new.target.prototype) || ApplePayError.prototype);
          errors.set(self, { code, contactField: contactField === undefined ? null : `${contactField}`, message: message === undefined ? "" : `${message}` });
          return self;
        },
      }.ApplePayError;
      setPrototypeOf(ApplePayError, window.Function.prototype);
      defineProperty(ApplePayError, "length", { value: 1 });
      setPrototypeOf(ApplePayError.prototype, window.Object.prototype);
      defineProperty(ApplePayError, "prototype", { writable: false });
      defineProperty(ApplePayError.prototype, Symbol.toStringTag, { value: "ApplePayError", configurable: true });
      for (const name of ["code", "contactField", "message"]) {
        defineProperty(ApplePayError.prototype, name, {
          get: method("get " + name, 0, function () { const e = errors.get(this); if (!e) throw new PageTypeError("The ApplePayError." + name + " getter can only be used on instances of ApplePayError"); return e[name]; }),
          set: method("set " + name, 1, function (value) { const e = errors.get(this); if (e) e[name] = `${value}`; }),
          enumerable: true,
          configurable: true,
        });
      }
      defineProperty(window, "ApplePayError", { value: ApplePayError, writable: true, enumerable: false, configurable: true });
    }
    if (!window.ApplePaySession && window.isSecureContext && window.EventTarget) {
      const Session = nativeClass("ApplePaySession", window.EventTarget);
      constants(Session, [["STATUS_SUCCESS", 0], ["STATUS_FAILURE", 1], ["STATUS_INVALID_BILLING_POSTAL_ADDRESS", 2], ["STATUS_INVALID_SHIPPING_POSTAL_ADDRESS", 3], ["STATUS_INVALID_SHIPPING_CONTACT", 4], ["STATUS_PIN_REQUIRED", 5], ["STATUS_PIN_INCORRECT", 6], ["STATUS_PIN_LOCKOUT", 7]]);
      addMethod(Session, "canMakePayments", 0, () => false);
      addMethod(Session, "canMakePaymentsWithActiveCard", 1, () => resolvedWith(false));
      addMethod(Session, "openPaymentSetup", 1, () => resolvedWith(false));
      addMethod(Session, "supportsVersion", 1, (version) => {
        const v = +version;
        return v >= 1 && v <= (atLeast("18") ? 15 : atLeast("17") ? 14 : 13) && floor(v) === v;
      });
    }
  }

  // Media: an iPhone has no MediaSource of its own (taken away below);
  // from iOS 17.1 it has ManagedMediaSource, made here from Chromium's,
  // so a player that uses it plays as on an iPhone.
  if (RealMediaSource && RealSourceBuffer && atLeast("17.1") && !window.ManagedMediaSource) {
    const ManagedSourceBuffer = nativeClass("ManagedSourceBuffer", RealSourceBuffer);
    addHandler(ManagedSourceBuffer.prototype, "onbufferedchange");
    nativeClass("BufferedChangeEvent", PageEvent);
    const opened = new WeakSet();
    const Managed = {
      ManagedMediaSource: function () {
        "use strict"; /* noor lookalike */
        if (new.target === undefined) throw new PageTypeError("Constructor requires 'new' operator");
        const source = Reflect.construct(RealMediaSource, [], new.target);
        // A player waits for "startstreaming" before it loads.
        if (addListener && dispatch && outside) {
          try {
            addListener.call(source, "sourceopen", outside.callback(() => {
              if (opened.has(source)) return;
              opened.add(source);
              try { dispatch.call(source, new PageEvent("startstreaming")); } catch (e) {}
            }, null));
          } catch (e) {}
        }
        return source;
      },
    }.ManagedMediaSource;
    setPrototypeOf(Managed, RealMediaSource);
    setPrototypeOf(Managed.prototype, RealMediaSource.prototype);
    defineProperty(Managed, "prototype", { writable: false });
    defineProperty(Managed.prototype, Symbol.toStringTag, { value: "ManagedMediaSource", configurable: true });
    addGetter(Managed.prototype, "streaming", () => true);
    addHandler(Managed.prototype, "onstartstreaming");
    addHandler(Managed.prototype, "onendstreaming");
    addMethod(Managed, "isTypeSupported", 1, (type) => RealMediaSource.isTypeSupported(`${type}`));
    define(RealMediaSource.prototype, "addSourceBuffer", (original) => function () {
      const buffer = original.apply(this, arguments);
      try { if (this instanceof Managed) setPrototypeOf(buffer, ManagedSourceBuffer.prototype); } catch (e) {}
      return buffer;
    });
    defineProperty(window, "ManagedMediaSource", { value: Managed, writable: true, enumerable: false, configurable: true });
  }

  // Storage: Safari's estimate has no per-kind details.
  {
    const storage = window.StorageManager && window.StorageManager.prototype;
    if (storage && typeof storage.estimate === "function") {
      define(storage, "estimate", (original) => function () {
        const result = original.apply(this, arguments);
        return result && typeof result.then === "function" ? result.then((estimate) => {
          try { if (estimate && "usageDetails" in estimate) delete estimate.usageDetails; } catch (e) {}
          return estimate;
        }) : result;
      });
    }
  }

  // Permissions as Safari answers them: its own names only (a name it
  // doesn't know is a TypeError, one it knows but can't tell is refused),
  // and the camera, microphone and location not asked yet ("prompt"; the
  // app refuses them, as a user who says no to every site).
  if (window.Permissions && window.PermissionStatus) {
    const NAMES = ["accelerometer", "background-fetch", "bluetooth", "camera", "display-capture", "geolocation", "gyroscope", "local-network", "loopback-network", "magnetometer", "microphone", "midi", "nfc", "notifications", "push", "screen-wake-lock", "speaker-selection", "storage-access"];
    const TOLD = ["camera", "geolocation", "microphone", "notifications", "push", "storage-access"];
    define(window.Permissions.prototype, "query", (original) => function (descriptor) {
      let name;
      try {
        if (descriptor === null || (typeof descriptor !== "object" && typeof descriptor !== "function")) throw new PageTypeError("Type error");
        name = `${descriptor.name}`;
      } catch (error) {
        return rejectedWith(pageError(error));
      }
      if (NAMES.indexOf(name) === -1) return rejectedWith(new PageTypeError("Type error"));
      if (TOLD.indexOf(name) === -1) return rejectedWith(new PageException("Permissions::query does not support this API", "NotSupportedError"));
      return original.call(this, { name });
    });
    // Chromium names some by what it uses inside ("video_capture" for the
    // camera); Safari by the names asked.
    const INNER = { video_capture: "camera", audio_capture: "microphone" };
    regetter(window.PermissionStatus.prototype, "name", (value) => INNER[value] || value);
    regetter(window.PermissionStatus.prototype, "state", function (value) {
      return value === "denied" && ["camera", "microphone", "geolocation"].indexOf(this.name) !== -1 ? "prompt" : value;
    });
  }

  // WebGL: an iPhone's graphics card, as Safari tells it (WebKit's names
  // and versions, Apple's GPU, the limits Metal gives, see WebKit's
  // DisplayMtl.mm) and its extensions, of those Chromium really has.
  {
    const WEBGL1 = ["ANGLE_instanced_arrays", "EXT_blend_minmax", "EXT_clip_control", "EXT_color_buffer_half_float", "EXT_depth_clamp", "EXT_float_blend", "EXT_frag_depth", "EXT_polygon_offset_clamp", "EXT_shader_texture_lod", "EXT_texture_filter_anisotropic", "EXT_texture_mirror_clamp_to_edge", "EXT_sRGB", "KHR_parallel_shader_compile", "OES_element_index_uint", "OES_fbo_render_mipmap", "OES_standard_derivatives", "OES_texture_float", "OES_texture_float_linear", "OES_texture_half_float", "OES_texture_half_float_linear", "OES_vertex_array_object", "WEBGL_blend_func_extended", "WEBGL_color_buffer_float", "WEBGL_compressed_texture_astc", "WEBGL_compressed_texture_etc", "WEBGL_compressed_texture_etc1", "WEBGL_compressed_texture_pvrtc", "WEBKIT_WEBGL_compressed_texture_pvrtc", "WEBGL_debug_renderer_info", "WEBGL_debug_shaders", "WEBGL_depth_texture", "WEBGL_draw_buffers", "WEBGL_lose_context", "WEBGL_multi_draw", "WEBGL_polygon_mode"];
    const WEBGL2 = ["EXT_clip_control", "EXT_color_buffer_float", "EXT_color_buffer_half_float", "EXT_conservative_depth", "EXT_depth_clamp", "EXT_float_blend", "EXT_polygon_offset_clamp", "EXT_render_snorm", "EXT_texture_filter_anisotropic", "EXT_texture_mirror_clamp_to_edge", "EXT_texture_norm16", "KHR_parallel_shader_compile", "NV_shader_noperspective_interpolation", "OES_draw_buffers_indexed", "OES_sample_variables", "OES_shader_multisample_interpolation", "OES_texture_float_linear", "WEBGL_blend_func_extended", "WEBGL_clip_cull_distance", "WEBGL_compressed_texture_astc", "WEBGL_compressed_texture_etc", "WEBGL_compressed_texture_etc1", "WEBGL_compressed_texture_pvrtc", "WEBKIT_WEBGL_compressed_texture_pvrtc", "WEBGL_debug_renderer_info", "WEBGL_debug_shaders", "WEBGL_draw_instanced_base_vertex_base_instance", "WEBGL_lose_context", "WEBGL_multi_draw", "WEBGL_multi_draw_instanced_base_vertex_base_instance", "WEBGL_polygon_mode", "WEBGL_provoking_vertex", "WEBGL_render_shared_exponent", "WEBGL_stencil_texturing"];
    // Limits: an iPhone's, or this card's where it allows less, so a page
    // that goes by them still draws.
    const LIMITS = {
      0x0D33: 16384, 0x851C: 16384, 0x84E8: 16384, 0x8869: 16, 0x8DFB: 1024, 0x8DFD: 1024, 0x8DFC: 31,
      0x8872: 16, 0x8B4C: 16, 0x8B4D: 32, 0x84FF: 16,
    };
    const LIMITS2 = {
      0x8073: 2048, 0x88FF: 2048, 0x8824: 8, 0x8CDF: 8, 0x8D57: 4, 0x8A30: 16384, 0x8A2B: 16, 0x8A2D: 16, 0x8A2E: 32,
      0x8A2F: 32, 0x9122: 124, 0x9125: 124, 0x8B4A: 4096, 0x8B49: 4096, 0x8A31: 69632, 0x8A33: 69632, 0x8B4B: 124,
      0x8C8A: 64, 0x8C8B: 4, 0x8C80: 4, 0x84FD: 15,
    };
    const patch = (Context, two) => {
      const proto = Context && Context.prototype;
      if (!proto) return;
      const order = two ? WEBGL2 : WEBGL1;
      const supportedOf = (original, self) => {
        const real = original.call(self);
        if (!real) return real;
        const has = new Set(real);
        return own(order.filter((name) => has.has(name)));
      };
      const own = (list) => setPrototypeOf(list, window.Array.prototype);
      const realSupported = proto.getSupportedExtensions;
      redefine(proto, "getSupportedExtensions", (original) => function () {
        return supportedOf(original, this);
      });
      const listed = new WeakMap();
      // Safari tells the card's names only once the page has asked for
      // WEBGL_debug_renderer_info on that context.
      const debugInfo = new WeakSet();
      redefine(proto, "getExtension", (original) => function (name) {
        if (!arguments.length) return original.apply(this, arguments);
        const text = `${name}`;
        let names = listed.get(this);
        if (!names) {
          try {
            const supported = supportedOf(realSupported, this);
            names = new Set((supported || []).map((n) => n.toLowerCase()));
            if (supported) listed.set(this, names);
          } catch (e) {
            names = null;
          }
        }
        if (names && !names.has(text.toLowerCase())) return null;
        const extension = original.call(this, text);
        if (extension && text.toLowerCase() === "webgl_debug_renderer_info") debugInfo.add(this);
        return extension;
      });
      redefine(proto, "getParameter", (original) => function (pname) {
        if (!arguments.length) return original.apply(this, arguments);
        const value = original.apply(this, arguments);
        const p = +pname;
        switch (p) {
          case 0x1F00: return "WebKit";
          case 0x1F01: return "WebKit WebGL";
          case 0x1F02: return value === null ? value : two ? "WebGL 2.0" : "WebGL 1.0";
          case 0x8B8C: return value === null ? value : two ? "WebGL GLSL ES 3.00" : "WebGL GLSL ES 1.0 (1.0)";
          case 0x9245: return value === null || !debugInfo.has(this) ? null : "Apple Inc.";
          case 0x9246: return value === null || !debugInfo.has(this) ? null : "Apple GPU";
          case 0x0D3A: return value && typeof value.length === "number" ? new window.Int32Array([min(value[0], 16384), min(value[1], 16384)]) : value;
          case 0x846D: return value && typeof value.length === "number" ? new window.Float32Array([1, min(value[1], 511)]) : value;
          case 0x846E: return value && typeof value.length === "number" ? new window.Float32Array([1, 1]) : value;
          default: break;
        }
        const limit = LIMITS[p] !== undefined ? LIMITS[p] : two ? LIMITS2[p] : undefined;
        if (limit !== undefined && typeof value === "number") return min(value, limit);
        return value;
      });
    };
    patch(window.WebGLRenderingContext, false);
    patch(window.WebGL2RenderingContext, true);
  }

  // Voices: an iPhone's, by language, where Chromium has this PC's (their
  // names would tell Windows). One a page picks speaks with a voice of
  // this PC's of its language, and reads back as picked.
  {
    const Voice = window.SpeechSynthesisVoice;
    const Synthesis = window.SpeechSynthesis;
    const Utterance = window.SpeechSynthesisUtterance;
    if (Voice && Synthesis && Utterance) {
      const COMPACT = [
        ["Majed", "ar-001", "Maged"], ["Daria", "bg-BG"], ["Montse", "ca-ES", "Montserrat"], ["Zuzana", "cs-CZ"], ["Sara", "da-DK"],
        ["Anna", "de-DE"], ["Melina", "el-GR"], ["Karen", "en-AU"], ["Daniel", "en-GB"], ["Moira", "en-IE"], ["Rishi", "en-IN"],
        ["Samantha", "en-US"], ["Tessa", "en-ZA"], ["Mónica", "es-ES", "Monica"], ["Paulina", "es-MX"], ["Satu", "fi-FI"],
        ["Amélie", "fr-CA", "Amelie"], ["Thomas", "fr-FR"], ["Carmit", "he-IL"], ["Lekha", "hi-IN"], ["Lana", "hr-HR"],
        ["Tünde", "hu-HU", "Mariska"], ["Damayanti", "id-ID"], ["Alice", "it-IT"], ["Kyoko", "ja-JP"], ["Yuna", "ko-KR"],
        ["Amira", "ms-MY"], ["Nora", "nb-NO"], ["Ellen", "nl-BE"], ["Xander", "nl-NL"], ["Zosia", "pl-PL"], ["Luciana", "pt-BR"],
        ["Joana", "pt-PT"], ["Ioana", "ro-RO"], ["Milena", "ru-RU"], ["Laura", "sk-SK"], ["Alva", "sv-SE"], ["Kanya", "th-TH"],
        ["Yelda", "tr-TR"], ["Lesya", "uk-UA"], ["Linh", "vi-VN"], ["Tingting", "zh-CN"], ["Sinji", "zh-HK"], ["Meijia", "zh-TW"],
      ];
      const NOVELTY = [["Albert"], ["Bad News", "BadNews"], ["Bahh"], ["Bells"], ["Boing"], ["Bubbles"], ["Cellos"], ["Fred"], ["Good News", "GoodNews"], ["Jester", "Hysterical"], ["Junior"], ["Kathy"], ["Organ"], ["Ralph"], ["Superstar", "Princess"], ["Trinoids"], ["Whisper"], ["Wobble", "Deranged"], ["Zarvox"]];
      const ELOQUENCE = ["Eddy", "Flo", "Grandma", "Grandpa", "Reed", "Rocko", "Sandy", "Shelley"];
      const ELOQUENT = [["de-DE", "German (Germany)"], ["en-GB", "English (UK)"], ["en-US", "English (US)"], ["es-ES", "Spanish (Spain)"], ["es-MX", "Spanish (Mexico)"], ["fi-FI", "Finnish (Finland)"], ["fr-CA", "French (Canada)"], ["fr-FR", "French (France)"], ["it-IT", "Italian (Italy)"], ["pt-BR", "Portuguese (Brazil)"]];
      const language = (config.languages && config.languages[0]) || "en-US";
      const LIST = [];
      for (const [name, lang, id] of COMPACT) LIST.push({ name, lang, voiceURI: `com.apple.voice.compact.${lang}.${id || name}` });
      for (const [lang, title] of ELOQUENT) for (const name of ELOQUENCE) LIST.push({ name: `${name} (${title})`, lang, voiceURI: `com.apple.eloquence.${lang}.${name}` });
      for (const [name, id] of NOVELTY) LIST.push({ name, lang: "en-US", voiceURI: `com.apple.speech.synthesis.voice.${id || name}` });
      const mine = LIST.find((v) => v.lang === language) || LIST.find((v) => v.lang.split("-")[0] === language.split("-")[0]) || LIST.find((v) => v.lang === "en-US");
      const fakes = new WeakMap();
      let voices = null;
      const iphoneVoices = () => voices || (voices = LIST.map((d) => {
        const voice = Object.create(Voice.prototype);
        fakes.set(voice, { name: d.name, lang: d.lang, voiceURI: d.voiceURI, isDefault: d === mine });
        return voice;
      }));
      const values = { voiceURI: (d) => d.voiceURI, name: (d) => d.name, lang: (d) => d.lang, localService: () => true, default: (d) => d.isDefault };
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
          original.apply(this, arguments);
          return setPrototypeOf(iphoneVoices().slice(), window.Array.prototype);
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

  // Fonts: an iPhone's, not this PC's. Each page (and worker) gets a face
  // of its own for every font of IPHONE_FONTS: a Windows font's covers no
  // character, so text asked in it falls through to the next font, as where
  // it isn't installed; an iPhone font's draws the text with a font of this
  // PC's much like it. A font asked for by name (FontFace's local()) is
  // looked for the same way, and these faces are left out of what the
  // page's own font list shows.
  {
    const blocked = new Set(IPHONE_FONTS.block.map((name) => name.toLowerCase()));
    const added = new Map(Object.entries(IPHONE_FONTS.add).map(([name, local]) => [name.toLowerCase(), local]));
    const familyOf = (name) => {
      const lower = name.toLowerCase();
      if (blocked.has(lower) || added.has(lower)) return lower;
      // A face's full name ("Futura Bold"): its family's.
      for (const family of added.keys()) if (lower.indexOf(family + " ") === 0) return family;
      for (const family of blocked) if (lower.indexOf(family + " ") === 0) return family;
      return null;
    };
    const missing = "Noor No Such Font " + String(config.mark || "").slice(0, 6);
    // Behind an iPhone font, the font of this PC named for it, or one every
    // system has.
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
    // A page's own font list (a worker's isn't there before its first
    // line, and asking for it then ends the renderer; see below).
    const fontSet = isWindow ? document.fonts : null;
    const FontSet = window.FontFaceSet;
    const ours = protectedFaces;
    if (typeof RealFontFace === "function" && FontSet) {
      const realAdd = FontSet.prototype.add;
      const realDelete = FontSet.prototype.delete;
      const face = (family, local, range) => {
        if (!fontSet) return;
        try {
          const made = new RealFontFace(family, localsFor(local), { unicodeRange: range, weight: "1 1000" });
          ours.add(made);
          realAdd.call(fontSet, made);
          const loading = made.load();
          if (loading && typeof loading.catch === "function") loading.catch(() => {});
        } catch (e) {}
      };
      // An existing font of Windows behind the faces that draw nothing.
      for (const name of IPHONE_FONTS.block) face(name, "Arial", "U+10FFFF");
      for (const name of Object.keys(IPHONE_FONTS.add)) face(name, IPHONE_FONTS.add[name], "U+0-10FFFE");

      const FontFace = {
        FontFace: function (family, source) {
          "use strict"; /* noor lookalike */
          if (new.target === undefined) throw new PageTypeError("Constructor requires 'new' operator");
          const args = Array.prototype.slice.call(arguments);
          if (args.length >= 2 && !(args[1] && typeof args[1] === "object")) args[1] = rewrite(`${args[1]}`);
          return Reflect.construct(RealFontFace, args, new.target === FontFace ? RealFontFace : new.target);
        },
      }.FontFace;
      setPrototypeOf(FontFace, getPrototypeOf(RealFontFace));
      defineProperty(FontFace, "length", { value: RealFontFace.length });
      defineProperty(FontFace, "prototype", { value: RealFontFace.prototype, writable: false, enumerable: false, configurable: false });
      originals.set(FontFace, RealFontFace);
      try { defineProperty(RealFontFace.prototype, "constructor", { value: FontFace, writable: true, enumerable: false, configurable: true }); } catch (e) {}
      defineProperty(window, "FontFace", { value: FontFace, writable: true, enumerable: false, configurable: true });

      const proto = FontSet.prototype;
      const valuesOf = proto.values;
      // The faces the page's own (a call on anything but a font list is
      // refused, as the browser refuses it).
      const theirs = (set) => {
        const list = [];
        const iterator = valuesOf.call(set);
        for (let step = iterator.next(); !step.done; step = iterator.next()) if (!ours.has(step.value)) list.push(step.value);
        return list;
      };
      const iterate = (list, kind) => {
        const array = setPrototypeOf(list.map((item) => (kind === "entries" ? setPrototypeOf([item, item], window.Array.prototype) : item)), window.Array.prototype);
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
        return result && typeof result.then === "function" ? result.then((faces) => setPrototypeOf(Array.prototype.filter.call(faces, (item) => !ours.has(item)), window.Array.prototype)) : result;
      });
      if (fontFaceSetLoadEvent) {
        defineGetter(fontFaceSetLoadEvent.prototype, "fontfaces", (value) => {
          if (!value || typeof value.length !== "number") return value;
          const list = Array.prototype.filter.call(value, (item) => !ours.has(item));
          return list.length === value.length ? value : window.Object.freeze(setPrototypeOf(list, window.Array.prototype));
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
          get: lookalike(fontOf.get, function () {
            const value = fontOf.get.call(this);
            const mine = asked.get(this);
            return mine && mine.set === value ? mine.asked : value;
          }),
          set: lookalike(fontOf.set, function (value) {
            const text = `${value}`;
            // The size and style come first, the families after the size.
            const at = text.search(/\d(?:[\d.]*)(?:px|pt|em|rem|%|vw|vh|ex|ch)\b(?:\s*\/\s*[^\s]+)?\s+/i);
            const split = at === -1 ? -1 : text.slice(at).search(/\s+/) + at;
            const changed = split > 0 ? text.slice(0, split) + families(text.slice(split)) : text;
            fontOf.set.call(this, changed);
            if (changed !== text) asked.set(this, { asked: fontOf.get.call(this) === changed ? text : text, set: fontOf.get.call(this) });
            else asked.delete(this);
          }),
          configurable: true,
          enumerable: fontOf.enumerable,
        });
      }
    }
  }

  // Last, what an iPhone of this iOS version doesn't have (see
  // scripts/parts/iphone-surface.js): members first, then the globals
  // they hang on.
  {
    const has = (spec) => {
      if (spec === "") return false;
      return String(spec).split("|").some((part) => {
        const dash = part.indexOf("-");
        const from = dash === -1 ? part : part.slice(0, dash);
        const until = dash === -1 ? "" : part.slice(dash + 1);
        return (!from || compareVersions(iphone.iOS, from) >= 0) && (!until || compareVersions(iphone.iOS, until) < 0);
      });
    };
    const scope = isWindow ? "window" : "worker";
    for (const where of Object.keys(IPHONE_SURFACE)) {
      if (where === "window" || where === "worker") continue;
      const dot = where.indexOf(".");
      const owner = window[dot === -1 ? where : where.slice(0, dot)];
      const target = owner && (dot === -1 ? owner : owner.prototype);
      if (!target || (typeof target !== "object" && typeof target !== "function")) continue;
      const names = IPHONE_SURFACE[where];
      for (const name of Object.keys(names)) {
        if (!has(names[name])) {
          try { delete target[name]; } catch (e) {}
        }
      }
    }
    const globals = IPHONE_SURFACE[scope] || {};
    for (const name of Object.keys(globals)) {
      if (!has(globals[name])) {
        try { delete window[name]; } catch (e) {}
      }
    }
  }
}
