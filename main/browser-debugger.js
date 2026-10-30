"use strict";

/// Chromium's own debugging target, through the port the app gives it as it
/// starts (see main.js; it listens on this computer only, and pages can't
/// reach it). It reaches the workers no tab's debugger does: shared workers,
/// which a page can make to read the hardware and draw outside its own
/// window, and service workers, which start apart from any tab. Each is held
/// as it starts, given the protection as the inspector's own code (V8 shows
/// no frame of it in a stack, and shows it as built-in), and let go.
class BrowserDebugger {
  /// `scriptFor(url)`: the protection for a worker whose script is at
  /// `url`, as text, or null to leave the worker alone. `Socket` is the
  /// WebSocket to use (tests give a stand-in).
  constructor({ port, scriptFor, Socket = globalThis.WebSocket, fetch = globalThis.fetch }) {
    this.port = port;
    this.scriptFor = scriptFor;
    this.Socket = Socket;
    this.fetch = fetch;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    /// Whether the workers are handled here (connected).
    this.active = false;
  }

  /// The browser target's address from what the port answers at
  /// /json/version, or null if that isn't Chromium's answer on this port.
  async address() {
    try {
      const response = await this.fetch(`http://127.0.0.1:${this.port}/json/version`);
      const answer = await response.json();
      const address = answer && answer.webSocketDebuggerUrl;
      const pattern = new RegExp(`^ws://127\\.0\\.0\\.1:${this.port}/devtools/browser/[\\w-]+$`);
      return typeof address === "string" && pattern.test(address) ? address : null;
    } catch (error) {
      return null;
    }
  }

  /// Connects, as Chromium opens its port, and asks for the workers.
  async connect(waitMs = 5000) {
    const until = Date.now() + waitMs;
    let address = await this.address();
    while (!address && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      address = await this.address();
    }
    if (!address) {
      return false;
    }
    const socket = new this.Socket(address);
    try {
      await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve);
        socket.addEventListener("error", reject);
      });
    } catch (error) {
      return false;
    }
    this.socket = socket;
    socket.addEventListener("message", (event) => this.receive(String(event.data)));
    socket.addEventListener("close", () => this.closed());
    await this.send("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
      filter: [{ type: "shared_worker" }, { type: "service_worker" }, { exclude: true }],
    });
    this.active = true;
    return true;
  }

  send(method, params = {}, sessionId) {
    if (!this.socket) {
      return Promise.reject(new Error("Not connected"));
    }
    const id = this.nextId++;
    const message = { id, method, params };
    if (sessionId) {
      message.sessionId = sessionId;
    }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.socket.send(JSON.stringify(message));
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  receive(text) {
    let message;
    try {
      message = JSON.parse(text);
    } catch (error) {
      return;
    }
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message || "Failed"));
      } else {
        resolve(message.result || {});
      }
    } else if (message.method === "Target.attachedToTarget" && message.params) {
      this.attached(message.params).catch(() => {});
    }
  }

  closed() {
    this.active = false;
    this.socket = null;
    for (const { reject } of this.pending.values()) {
      reject(new Error("Closed"));
    }
    this.pending.clear();
  }

  /// A worker held before its first line: the protection, then let go.
  async attached({ sessionId, targetInfo }) {
    const script = targetInfo ? this.scriptFor(targetInfo.url || "") : null;
    if (script) {
      try {
        const global = await this.send("Runtime.evaluate", { expression: "globalThis", silent: true }, sessionId);
        const objectId = global && global.result && global.result.objectId;
        if (objectId) {
          // Given as the argument of a call, as text, it is compiled as the
          // inspector's own code (see Tab.injectWorker).
          await this.send("Runtime.callFunctionOn", {
            objectId,
            functionDeclaration: "function () {}",
            arguments: [{ unserializableValue: script }],
            silent: true,
          }, sessionId);
          this.send("Runtime.releaseObject", { objectId }, sessionId).catch(() => {});
        }
      } catch (error) {
        // The worker goes on unprotected rather than not at all.
      }
    }
    await this.send("Runtime.runIfWaitingForDebugger", {}, sessionId).catch(() => {});
  }
}

module.exports = { BrowserDebugger };
