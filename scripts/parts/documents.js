// A window protected while empty (about:blank), from the page around it,
// that then loads a page of the same site keeps that place: Chromium keeps
// such a window for the page and gives it only a document of its own, and
// runs no preload there, so the protection in it is the one put in while it
// was empty. What that protection makes for a document (the fonts' faces,
// above all: without them a frame of the site's own shows this computer's
// fonts) is made again for the new one (see eachDocument) as soon as it is
// found there: when the page reaches anything replaced (see run), when the
// page around the frame reaches it (see protectWindow), and here, before
// the page reads what fonts decide (the box of an element or of text, its
// style, a canvas's text, a font check) through what nothing else
// replaces, and at the latest when the page is first shown, or loaded.
// Only in such a window (a window empty when protected).
{
  const pass = (original) => function () {
    return original.apply(this, arguments);
  };
  const measured = (proto, names) => {
    if (!proto) return;
    for (const name of names) defineGetter(proto, name, (value) => value);
  };
  measured(window.HTMLElement && window.HTMLElement.prototype, ["offsetWidth", "offsetHeight"]);
  measured(window.Element && window.Element.prototype, ["clientWidth", "clientHeight", "scrollWidth", "scrollHeight"]);
  define(window, "getComputedStyle", pass);
  if (window.CanvasRenderingContext2D) define(window.CanvasRenderingContext2D.prototype, "measureText", pass);
  if (window.FontFaceSet) define(window.FontFaceSet.prototype, "check", pass);
  // (With the ClientRects protection, these are its own already.)
  if (config.seeds.clientRects == null) {
    for (const proto of [window.Element && window.Element.prototype, window.Range && window.Range.prototype]) {
      if (!proto) continue;
      define(proto, "getBoundingClientRect", pass);
      define(proto, "getClientRects", pass);
    }
  }
  if (window.SVGGraphicsElement) define(window.SVGGraphicsElement.prototype, "getBBox", pass);
  if (window.SVGTextContentElement) {
    for (const name of ["getComputedTextLength", "getSubStringLength"]) define(window.SVGTextContentElement.prototype, name, pass);
  }
  for (const type of ["ResizeObserver", "IntersectionObserver"]) {
    if (window[type]) define(window[type].prototype, "observe", pass);
  }
  // At the latest: the window keeps its listeners for the page it loads.
  const addListener = window.EventTarget && window.EventTarget.prototype.addEventListener;
  if (addListener) {
    for (const type of ["pagereveal", "DOMContentLoaded", "pageshow", "load"]) {
      try {
        if (outside) outside.apply(addListener, window, [type, outside.callback(syncDocument, null), true]);
        else addListener.call(window, type, syncDocument, true);
      } catch (e) {}
    }
  }
}
