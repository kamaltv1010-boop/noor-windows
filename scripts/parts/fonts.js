// Fonts: pages find only the fonts Windows comes with. A font some other
// program put on this computer (Office's, Adobe's, a game's…: config.fonts,
// see main/fonts.js) is one a site measures to tell the computer, and every
// profile on it, from others. Each page gets, for each such font, a face
// of its own that covers no character: text asked in that font falls
// through to the next font, as where it isn't installed. Never loaded,
// these faces start no download and fire no event, and the page's own font
// list (document.fonts) doesn't show them. A font asked for by name
// (FontFace's local()) is looked for the same way, and so is one given to
// a worker's canvas (a worker's font list isn't there before its first
// line). Noor iPhone has its own fonts (scripts/parts/iphone.js).
{
  const fonts = config.fonts;
  const isWindow = Boolean(document) && typeof window.Window === "function";
  const PageTypeError = window.TypeError;
  const lower = (name) => String(name).toLowerCase().replace(/\s+/g, " ").trim();
  const shadow = Array.isArray(fonts.shadow) ? fonts.shadow : [];
  const hidden = new Set(shadow.map(lower));
  const local = new Set((Array.isArray(fonts.local) ? fonts.local : []).map(lower));
  const missing = "Noor No Such Font " + String(config.mark || "").slice(0, 6);
  const quoted = (name) => '"' + name.replace(/["\\]/g, "\\$&") + '"';
  const RealFontFace = window.FontFace;
  const FontSet = window.FontFaceSet;
  // The faces made here, in this page's and in its empty frames'.
  const ours = new WeakSet();

  if (typeof RealFontFace === "function") {
    // local(): a hidden font's names find nothing.
    const rewrite = (source) => source.replace(/local\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi, (whole, a, b, c) => {
      const name = (a !== undefined ? a : b !== undefined ? b : c).trim();
      return local.has(lower(name)) ? `local(${quoted(missing)})` : whole;
    });
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
    originals.set(FontFace, RealFontFace);
    try { defineProperty(RealFontFace.prototype, "constructor", { value: FontFace, writable: true, enumerable: false, configurable: true }); } catch (e) {}
    defineProperty(window, "FontFace", { value: FontFace, writable: true, enumerable: false, configurable: true });
  }

  // The page's faces: one for each hidden font, covering no character
  // anyone writes (U+10FFFF), from an address never fetched.
  if (isWindow && typeof RealFontFace === "function" && FontSet && shadow.length) {
    const realAdd = FontSet.prototype.add;
    const fontSet = document.fonts;
    if (fontSet) {
      for (const name of shadow) {
        try {
          const made = new RealFontFace(name, "url(data:,)", { unicodeRange: "U+10FFFF" });
          ours.add(made);
          realAdd.call(fontSet, made);
        } catch (e) {}
      }
    }

    // The page's own font list, without them.
    const proto = FontSet.prototype;
    const realDelete = proto.delete;
    const valuesOf = proto.values;
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
  }

  // A worker's canvas: a hidden font given by name finds nothing, and reads
  // back as the browser writes what was given ('Inter' as Inter), read
  // from a canvas of this script's own.
  if (!isWindow && window.OffscreenCanvasRenderingContext2D && window.OffscreenCanvas && hidden.size) {
    const Context = window.OffscreenCanvasRenderingContext2D;
    const fontOf = getOwnPropertyDescriptor(Context.prototype, "font");
    const RealOffscreenCanvas = window.OffscreenCanvas;
    const getContext = RealOffscreenCanvas.prototype.getContext;
    if (fontOf && fontOf.get && fontOf.set && typeof getContext === "function") {
      const asked = new WeakMap();
      let scratch = null;
      const SENTINEL = "1px " + quoted(missing);
      // How the browser writes `text` as a canvas font, or null where it
      // takes no such font (the canvas keeps the one it had).
      const written = (text) => {
        try {
          if (!scratch) scratch = getContext.call(new RealOffscreenCanvas(1, 1), "2d");
          fontOf.set.call(scratch, SENTINEL);
          const sentinel = fontOf.get.call(scratch);
          fontOf.set.call(scratch, text);
          const value = fontOf.get.call(scratch);
          return value === sentinel ? null : value;
        } catch (e) {
          return null;
        }
      };
      const families = (text) => text.replace(/(["'])([^"']+)\1|([^,\s"'][^,"']*)/g, (whole, q, inQuotes, bare) => {
        const name = (inQuotes !== undefined ? inQuotes : bare).trim();
        return hidden.has(lower(name)) ? quoted(missing) : whole;
      });
      defineProperty(Context.prototype, "font", {
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
          const shown = changed !== text ? written(text) : null;
          if (shown !== null) asked.set(this, { asked: shown, set: fontOf.get.call(this) });
          else asked.delete(this);
        }),
        configurable: true,
        enumerable: fontOf.enumerable,
      });
    }
  }
}
