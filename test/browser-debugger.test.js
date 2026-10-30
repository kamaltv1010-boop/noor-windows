"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { BrowserDebugger } = require("../main/browser-debugger");

/// A stand-in for Chromium's WebSocket: what is sent, answered at once.
class FakeSocket extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.sent = [];
    FakeSocket.last = this;
    setTimeout(() => this.dispatchEvent(new Event("open")), 0);
  }

  send(text) {
    const message = JSON.parse(text);
    this.sent.push(message);
    const result = message.method === "Runtime.evaluate" ? { result: { objectId: "global-1" } } : {};
    setTimeout(() => this.fromChrome({ id: message.id, result, sessionId: message.sessionId }), 0);
  }

  fromChrome(message) {
    const event = new Event("message");
    event.data = JSON.stringify(message);
    this.dispatchEvent(event);
  }
}

const answering = (body) => async () => ({ json: async () => body });
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("connects to Chromium's own target and asks for shared and service workers, held as they start", async () => {
  const port = 23456;
  const debuggerHere = new BrowserDebugger({
    port,
    scriptFor: () => null,
    Socket: FakeSocket,
    fetch: answering({ webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/abc-123` }),
  });
  assert.equal(await debuggerHere.connect(100), true);
  assert.equal(debuggerHere.active, true);
  const [attach] = FakeSocket.last.sent;
  assert.equal(attach.method, "Target.setAutoAttach");
  assert.equal(attach.params.waitForDebuggerOnStart, true);
  assert.deepEqual(attach.params.filter, [{ type: "shared_worker" }, { type: "service_worker" }, { exclude: true }]);
});

test("an answer that isn't Chromium's on its port isn't connected to", async () => {
  const debuggerHere = new BrowserDebugger({ port: 23457, scriptFor: () => null, Socket: FakeSocket, fetch: answering({ webSocketDebuggerUrl: "ws://example.com:23457/devtools/browser/x" }) });
  assert.equal(await debuggerHere.connect(50), false);
  assert.equal(debuggerHere.active, false);
});

test("a site's worker gets the protection as the inspector's code before its first line; others are only let go", async () => {
  const port = 23458;
  const scripts = { "https://site.example/shared.js": "protect()" };
  const debuggerHere = new BrowserDebugger({
    port,
    scriptFor: (url) => scripts[url] || null,
    Socket: FakeSocket,
    fetch: answering({ webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/abc` }),
  });
  await debuggerHere.connect(100);
  const socket = FakeSocket.last;
  socket.sent.length = 0;
  socket.fromChrome({ method: "Target.attachedToTarget", params: { sessionId: "s1", targetInfo: { type: "shared_worker", url: "https://site.example/shared.js" }, waitingForDebugger: true } });
  await settle();
  assert.deepEqual(socket.sent.map((m) => [m.method, m.sessionId]), [
    ["Runtime.evaluate", "s1"], ["Runtime.callFunctionOn", "s1"], ["Runtime.releaseObject", "s1"], ["Runtime.runIfWaitingForDebugger", "s1"],
  ]);
  const call = socket.sent[1].params;
  assert.equal(call.objectId, "global-1");
  assert.deepEqual(call.arguments, [{ unserializableValue: "protect()" }]);
  socket.sent.length = 0;
  socket.fromChrome({ method: "Target.attachedToTarget", params: { sessionId: "s2", targetInfo: { type: "service_worker", url: "chrome-extension://abc/sw.js" }, waitingForDebugger: true } });
  await settle();
  assert.deepEqual(socket.sent.map((m) => [m.method, m.sessionId]), [["Runtime.runIfWaitingForDebugger", "s2"]]);
});
