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
  if (!config) {
    return;
  }
  // The frame made below for the protection's realm, were Electron ever to
  // run this script there: nothing to do in it. Its mark, and the one a
  // replacement's source carries (the iPhone app's "noor lookalike"), are
  // the app's for this run, which no page knows.
  const REALM = config.realmKey || "noorRealm";
  const MARK = config.mark || "noor lookalike";
  try {
    if (window.frameElement && Object.prototype.hasOwnProperty.call(window.frameElement, REALM)) return;
  } catch (error) {}

  // The protection runs from a realm of its own: an empty frame's, made
  // and taken out of the document again before the page's first script.
  // V8 leaves a function out of a stack trace when its realm's security
  // token isn't that of the code reading the stack, and an empty frame
  // that has loaded nothing keeps a token of its own (Blink's
  // LocalWindowProxy::SetSecurityToken), so the protection's functions,
  // made there, show no frame in a stack a page reads, as the browser's own
  // built-ins show none (a page that runs its code inside them, through an
  // argument's valueOf or a script it adds, would otherwise find this
  // file's path, with the user's name, in the stack). The frame is lazy,
  // with an address it never loads, so it stays the empty document it
  // starts as: one with no address, or about:blank, loads about:blank at
  // once and takes the page's token. The protection is compiled there
  // through webFrame (no eval, so a page's CSP doesn't stop it), from the
  // text of it this script carries: the page's toString can't be asked for
  // it (in a window a protected page opened, whose window it keeps as it
  // loads a page of its site, the opener's protection has replaced it).
  // null if any of that fails: then it runs here, as before.
  const KEY = "noorProtect";
  const source = (key = KEY) => "(() => {\n" + protectSource.split("noor lookalike").join(MARK) + "\nwindow." + key + " = protectPage;\n})();\nvoid 0;\n";
  const hiddenProtect = () => {
    let frame = null;
    let parent = null;
    try {
      const document = window.document;
      frame = document.createElementNS("http://www.w3.org/1999/xhtml", "iframe");
      const name = "noor-realm-" + String(Math.random()).slice(2);
      frame.name = name;
      frame[REALM] = true;
      frame.loading = "lazy";
      frame.src = "https://0.0.0.0/";
      parent = document.documentElement || document;
      parent.appendChild(frame);
      const realm = frame.contentWindow;
      const child = webFrame.findFrameByName(name);
      if (!realm || !child || realm.location.href !== "about:blank") {
        return null;
      }
      const done = child.executeJavaScript(source());
      if (done && typeof done.catch === "function") {
        done.catch(() => {});
      }
      const made = realm[KEY];
      return typeof made === "function" ? made : null;
    } catch (error) {
      return null;
    } finally {
      try {
        if (frame && parent && frame.parentNode === parent) {
          parent.removeChild(frame);
        }
      } catch (error) {}
    }
  };

  // What the protection hands the browser to call later is handed over
  // from this realm, the page's, which the browser still calls back (see
  // `outside` in protect.js): taken before the page's scripts can change
  // them.
  const reflectApply = Reflect.apply;
  const reflectConstruct = Reflect.construct;
  const callMethod = Function.prototype.call;
  const bindMethod = Function.prototype.bind;
  const outside = {
    apply: (fn, self, args) => reflectApply(fn, self, args),
    construct: (Type, args) => reflectConstruct(Type, args),
    // A function of this realm that calls `fn` on `self` with no frame of its own.
    callback: (fn, self) => reflectApply(bindMethod, callMethod, [fn, self]),
  };

  const hidden = hiddenProtect();
  if (hidden) {
    try {
      hidden(window, Object.assign({}, config, { framesHidden: true, outside }));
      return;
    } catch (error) {
      // Run here instead.
    }
  }
  // Here instead, made from the same text (with this run's mark), handed
  // over through a property of the page's window that is gone again before
  // the page's first script.
  try {
    let made = null;
    try {
      const done = webFrame.executeJavaScript(source(REALM));
      if (done && typeof done.catch === "function") {
        done.catch(() => {});
      }
      made = window[REALM];
      delete window[REALM];
    } catch (error) {}
    (typeof made === "function" ? made : protectPage)(window, config);
  } catch (error) {
    // The page is shown unprotected rather than not at all.
  }
})();
