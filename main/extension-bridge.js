"use strict";
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

/// Electron runs no preload in an extension's service worker (it does in a
/// site's), so the API electron-chrome-extensions gives an extension's pages
/// (the tabs as the browser has them, windows, cookies, menus…) would be
/// missing from its background, which would have only Electron's own few:
/// there a tab counts as active only while it has the focus, so while the
/// extension's popup is open no tab is, and a background that asks for the
/// active tab finds none (nor any cookies, with no chrome.cookies at all).
/// Each extension's worker gets the library's own code in front of its
/// script (scripts/extension-sw-bridge.js), and its calls come here, over
/// fetch, to an address of the app's own on this computer: the request
/// names the extension (its origin, which Chromium sets), the app's secret
/// for this run is in its path, and the profile's session tells itself by
/// a header it adds on the way (see tag()). The events the worker listens
/// to wait here until it asks for them.

const SOURCE = path.join(__dirname, "..", "scripts", "extension-sw-bridge.js");
/// Written into the extension's folder (the app's own copy of it).
const BRIDGE = "noor-bridge.js";
const WRAPPER = "noor-background.js";
const RECORD = "noor-background.json";
const SESSION_HEADER = "x-noor-session";
/// How long a worker's question for events waits for one.
const WAIT = 25 * 1000;
/// The most events kept for a worker that doesn't ask.
const KEEP = 500;

/// Where the bridge talks to, as an extension's policy for its pages names
/// it: the port changes from one run of the app to the next.
const LOCAL = "http://127.0.0.1:*";

/// The extension's policy for its pages (`policy`), letting them (its
/// worker among them) reach the app's address if it limits where they
/// connect; as it was if it doesn't.
const withBridge = (policy) => {
  const directives = policy.split(";").map((directive) => directive.trim()).filter(Boolean);
  const find = (name) => directives.findIndex((directive) => directive.split(/\s+/)[0].toLowerCase() === name);
  // 'none' with another source would mean nothing.
  const sourcesOf = (index) => directives[index].split(/\s+/).slice(1).filter((source) => source.toLowerCase() !== "'none'");
  let connect = find("connect-src");
  if (connect === -1) {
    const fallback = find("default-src");
    if (fallback === -1) {
      return policy;
    }
    directives.push(["connect-src", ...sourcesOf(fallback)].join(" "));
    connect = directives.length - 1;
  } else if (sourcesOf(connect).includes(LOCAL)) {
    return policy;
  }
  directives[connect] = ["connect-src", ...sourcesOf(connect), LOCAL].join(" ");
  return directives.join("; ");
};

const readManifest = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8").replace(/^﻿/, ""));
  } catch (error) {
    return null;
  }
};

/// Puts the bridge (talking to `endpoint`) in front of the service worker
/// of the extension in `dir`: a script beside the worker's own (so the
/// paths the worker's script imports mean what they did) that loads the
/// bridge, then the worker's script; the manifest names it as the worker.
/// Done each time the extension is loaded, as the address changes from one
/// run of the app to the next; a policy of the extension's that limits
/// where its pages connect lets them reach it. Nothing for an extension
/// without a worker (or whose manifest can't be read). Whether it was done.
const prepareWorker = (dir, endpoint) => {
  const manifest = readManifest(dir);
  const background = manifest && manifest.background;
  if (!background || typeof background.service_worker !== "string") {
    return false;
  }
  let original = background.service_worker.replace(/^\.?\//, "");
  if (path.posix.basename(original) === WRAPPER) {
    try {
      original = JSON.parse(fs.readFileSync(path.join(dir, RECORD), "utf8")).original;
    } catch (error) {
      return false;
    }
  }
  if (typeof original !== "string" || !original || original.split("/").includes("..")) {
    return false;
  }
  const folder = path.posix.dirname(original);
  const wrapper = folder === "." ? WRAPPER : folder + "/" + WRAPPER;
  const script = "/" + original;
  const source = background.type === "module"
    ? `import "/${BRIDGE}";\nimport ${JSON.stringify(script)};\n`
    : `importScripts("/${BRIDGE}", ${JSON.stringify(script)});\n`;
  const bridge = fs.readFileSync(SOURCE, "utf8").replace("__NOOR_BRIDGE_ENDPOINT__", endpoint);
  fs.writeFileSync(path.join(dir, BRIDGE), bridge);
  fs.writeFileSync(path.join(dir, ...wrapper.split("/")), source);
  fs.writeFileSync(path.join(dir, RECORD), JSON.stringify({ original }));
  let changed = false;
  if (background.service_worker !== wrapper) {
    background.service_worker = wrapper;
    changed = true;
  }
  const policy = manifest.content_security_policy;
  if (policy && typeof policy === "object" && typeof policy.extension_pages === "string") {
    const allowed = withBridge(policy.extension_pages);
    if (allowed !== policy.extension_pages) {
      policy.extension_pages = allowed;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  }
  return true;
};

const queueOf = (state, extensionId) => {
  if (!state.waiting.has(extensionId)) {
    state.waiting.set(extensionId, { events: [], answers: [] });
  }
  return state.waiting.get(extensionId);
};

/// The running worker of the extension `id`, as the library gives a
/// handler its sender.
const workerOf = (ses, id) => {
  try {
    const scope = `chrome-extension://${id}/`;
    const running = ses.serviceWorkers.getAllRunning();
    for (const versionId of Object.keys(running)) {
      if (running[versionId].scope === scope) {
        return ses.serviceWorkers.getWorkerFromVersionID(Number(versionId)) || null;
      }
    }
  } catch (error) {
    // None, then.
  }
  return null;
};

class ExtensionBridge {
  constructor() {
    this.secret = crypto.randomBytes(16).toString("hex");
    this.port = 0;
    /// Each profile's session, by the key its requests carry.
    this.sessions = new Map();
    this.keys = new WeakMap();
    this.server = null;
    this.ready = null;
  }

  /// The address the workers talk to; listening once asked.
  start() {
    if (!this.ready) {
      this.ready = new Promise((resolve, reject) => {
        this.server = http.createServer((request, response) => {
          this.answer(request, response).catch(() => {
            try {
              response.statusCode = 500;
              response.end();
            } catch (error) {
              // Gone already.
            }
          });
        });
        this.server.on("error", reject);
        this.server.listen(0, "127.0.0.1", () => {
          this.port = this.server.address().port;
          resolve(this.endpoint);
        });
        if (typeof this.server.unref === "function") {
          this.server.unref();
        }
      });
    }
    return this.ready;
  }

  get endpoint() {
    return `http://127.0.0.1:${this.port}/${this.secret}/`;
  }

  /// Gives `dir`'s worker the bridge, once the address is known.
  async prepare(dir) {
    await this.start();
    return prepareWorker(dir, this.endpoint);
  }

  /// Answers the workers of the extensions in `ses`, whose API is `manager`'s.
  attach(ses, manager) {
    const router = manager && manager.ctx && manager.ctx.router;
    if (!router || typeof router.onExtensionMessage !== "function" || this.keys.has(ses)) {
      return false;
    }
    const key = crypto.randomBytes(16).toString("hex");
    const state = { ses, router, waiting: new Map() };
    this.keys.set(ses, key);
    this.sessions.set(key, state);
    // The library sends a worker's events through Electron's IPC, which
    // reaches no worker without a preload: they are kept for it instead,
    // and the worker started if it stopped (it listens again as it starts,
    // then asks). A page's listeners get them as before.
    router.sendEvent = function (targetExtensionId, eventName, ...args) {
      const listeners = this.listeners.get(eventName);
      if (!listeners || listeners.length === 0) {
        return;
      }
      for (const listener of listeners) {
        const { type, extensionId } = listener;
        if (targetExtensionId && targetExtensionId !== extensionId) {
          continue;
        }
        if (type === "service-worker") {
          const queue = queueOf(state, extensionId);
          queue.events.push([eventName, args]);
          if (queue.events.length > KEEP) {
            queue.events.splice(0, queue.events.length - KEEP);
          }
          if (queue.answers.length) {
            queue.answers.shift()(queue.events.splice(0));
          } else {
            try {
              ses.serviceWorkers.startWorkerForScope(`chrome-extension://${extensionId}/`).catch(() => {});
            } catch (error) {
              // The session is going.
            }
          }
        } else if (listener.host && !listener.host.isDestroyed()) {
          listener.host.send(`crx-${eventName}`, ...args);
        }
      }
    };
    return true;
  }

  /// The headers a request of `ses` goes out with: a request to the
  /// bridge gets the session's key; null for any other request.
  tag(ses, details) {
    const key = this.keys.get(ses);
    if (!key || !this.port || !String(details.url).startsWith(this.endpoint)) {
      return null;
    }
    const headers = Object.assign({}, details.requestHeaders);
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() === SESSION_HEADER) {
        delete headers[name];
      }
    }
    headers[SESSION_HEADER] = key;
    return headers;
  }

  async answer(request, response) {
    const send = (status, data, origin) => {
      response.statusCode = status;
      if (origin) {
        response.setHeader("access-control-allow-origin", origin);
      }
      response.setHeader("content-type", "application/json");
      response.setHeader("cache-control", "no-store");
      response.end(data === undefined ? "" : JSON.stringify(data));
    };
    const url = new URL(request.url, "http://127.0.0.1");
    const parts = url.pathname.split("/").filter(Boolean);
    const origin = String(request.headers.origin || "");
    const match = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin);
    const state = this.sessions.get(String(request.headers[SESSION_HEADER] || ""));
    const extension = match && state ? state.ses.extensions.getExtension(match[1]) : null;
    if (request.method !== "POST" || parts.length !== 2 || parts[0] !== this.secret || !extension) {
      return send(403);
    }
    const body = await new Promise((resolve) => {
      let text = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        text += chunk;
        if (text.length > 16 * 1024 * 1024) {
          request.destroy();
        }
      });
      request.on("end", () => {
        try {
          resolve(JSON.parse(text || "{}") || {});
        } catch (error) {
          resolve({});
        }
      });
      request.on("error", () => resolve({}));
    });
    const { ses, router } = state;
    const listener = { type: "service-worker", extensionId: extension.id };
    try {
      switch (parts[1]) {
        case "invoke": {
          const event = { type: "service-worker", session: ses, serviceWorker: workerOf(ses, extension.id) };
          const args = Array.isArray(body.args) ? body.args : [];
          const result = await router.onExtensionMessage(event, extension.id, String(body.name), ...args);
          return send(200, result === undefined ? { none: true } : { result }, origin);
        }
        case "listen":
          router.addListener(listener, extension.id, String(body.name));
          return send(200, {}, origin);
        case "unlisten":
          router.removeListener(listener, extension.id, String(body.name));
          return send(200, {}, origin);
        case "events": {
          const queue = queueOf(state, extension.id);
          if (queue.events.length) {
            return send(200, queue.events.splice(0), origin);
          }
          const events = await new Promise((resolve) => {
            const done = (list) => {
              clearTimeout(timer);
              const index = queue.answers.indexOf(done);
              if (index !== -1) {
                queue.answers.splice(index, 1);
              }
              resolve(list);
            };
            const timer = setTimeout(() => done([]), WAIT);
            queue.answers.push(done);
            response.on("close", () => done([]));
          });
          if (!response.destroyed) {
            return send(200, events, origin);
          }
          // The worker went: its events wait for it, started again to take
          // them, as it would be for a new one.
          if (events.length) {
            queue.events.unshift(...events);
            try {
              ses.serviceWorkers.startWorkerForScope(`chrome-extension://${extension.id}/`).catch(() => {});
            } catch (error) {
              // The session is going.
            }
          }
          return undefined;
        }
        default:
          return send(404, { error: "Unknown" }, origin);
      }
    } catch (error) {
      return send(500, { error: String((error && error.message) || error) }, origin);
    }
  }
}

module.exports = { ExtensionBridge, prepareWorker, withBridge, BRIDGE, WRAPPER, RECORD, SESSION_HEADER };
