"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { ExtensionBridge, prepareWorker, withBridge, BRIDGE, WRAPPER, RECORD } = require("../main/extension-bridge");
const { buildBridge } = require("../tools/build-extension-preload");

const extension = (manifest, files = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "noor-bridge-"));
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
};
const read = (dir, name) => fs.readFileSync(path.join(dir, ...name.split("/")), "utf8");
const manifestOf = (dir) => JSON.parse(read(dir, "manifest.json"));

test("the bridge goes in front of a worker's script, which keeps its own folder", () => {
  const dir = extension({ manifest_version: 3, name: "x", version: "1", background: { service_worker: "js/bg.js" } }, { "js/bg.js": "" });
  assert.equal(prepareWorker(dir, "http://127.0.0.1:1/s/"), true);
  assert.equal(manifestOf(dir).background.service_worker, "js/" + WRAPPER);
  assert.equal(read(dir, "js/" + WRAPPER), `importScripts("/${BRIDGE}", "/js/bg.js");\n`);
  assert.ok(read(dir, BRIDGE).includes('const ENDPOINT = "http://127.0.0.1:1/s/";'));
  assert.equal(JSON.parse(read(dir, RECORD)).original, "js/bg.js");
});

test("a module worker imports the bridge first", () => {
  const dir = extension({ manifest_version: 3, name: "x", version: "1", background: { service_worker: "./bg.mjs", type: "module" } }, { "bg.mjs": "" });
  prepareWorker(dir, "http://127.0.0.1:1/s/");
  assert.equal(manifestOf(dir).background.service_worker, WRAPPER);
  assert.equal(read(dir, WRAPPER), `import "/${BRIDGE}";\nimport "/bg.mjs";\n`);
});

test("done again, the worker is the same and the bridge has the new address", () => {
  const dir = extension({ manifest_version: 3, name: "x", version: "1", background: { service_worker: "bg.js" } }, { "bg.js": "" });
  prepareWorker(dir, "http://127.0.0.1:1/a/");
  prepareWorker(dir, "http://127.0.0.1:2/b/");
  assert.equal(manifestOf(dir).background.service_worker, WRAPPER);
  assert.equal(read(dir, WRAPPER), `importScripts("/${BRIDGE}", "/bg.js");\n`);
  assert.ok(read(dir, BRIDGE).includes('"http://127.0.0.1:2/b/"'));
});

test("a policy that limits where the extension's pages connect lets them reach the app", () => {
  const dir = extension({
    manifest_version: 3, name: "x", version: "1", background: { service_worker: "bg.js" },
    content_security_policy: { extension_pages: "default-src 'self'; script-src 'self'" },
  }, { "bg.js": "" });
  prepareWorker(dir, "http://127.0.0.1:1/s/");
  const policy = "default-src 'self'; script-src 'self'; connect-src 'self' http://127.0.0.1:*";
  assert.equal(manifestOf(dir).content_security_policy.extension_pages, policy);
  prepareWorker(dir, "http://127.0.0.1:2/s/");
  assert.equal(manifestOf(dir).content_security_policy.extension_pages, policy);
  assert.equal(withBridge("connect-src 'none'"), "connect-src http://127.0.0.1:*");
  assert.equal(withBridge("connect-src https://a.example"), "connect-src https://a.example http://127.0.0.1:*");
  // One that doesn't limit it stays as it is.
  assert.equal(withBridge("script-src 'self'; object-src 'self'"), "script-src 'self'; object-src 'self'");
});

test("an extension without a service worker is left as it is", () => {
  for (const manifest of [
    { manifest_version: 3, name: "x", version: "1" },
    { manifest_version: 2, name: "x", version: "1", background: { scripts: ["bg.js"] } },
    { manifest_version: 3, name: "x", version: "1", background: { service_worker: "../bg.js" } },
  ]) {
    const dir = extension(manifest);
    assert.equal(prepareWorker(dir, "http://127.0.0.1:1/s/"), false);
    assert.equal(fs.existsSync(path.join(dir, BRIDGE)), false);
    assert.deepEqual(manifestOf(dir), manifest);
  }
});

test("the bridge's code matches the library (rerun tools/build-extension-preload.js after updating it)", () => {
  const lf = (text) => text.replace(/\r\n/g, "\n");
  const written = lf(fs.readFileSync(path.join(__dirname, "..", "scripts", "extension-sw-bridge.js"), "utf8"));
  assert.ok(written === lf(buildBridge()), "scripts/extension-sw-bridge.js is out of step: run node tools/build-extension-preload.js");
  assert.ok(written.includes("__NOOR_BRIDGE_ENDPOINT__"));
});

const post = (url, body, headers = {}) => new Promise((resolve, reject) => {
  const request = http.request(url, { method: "POST", headers }, (response) => {
    let text = "";
    response.on("data", (chunk) => { text += chunk; });
    response.on("end", () => resolve({ status: response.statusCode, text, allow: response.headers["access-control-allow-origin"] }));
  });
  request.on("error", reject);
  request.end(JSON.stringify(body));
});

test("the app answers an extension of the profile, by its origin and the run's secret, and no one else", async () => {
  const bridge = new ExtensionBridge();
  await bridge.start();
  const id = "a".repeat(32);
  const calls = [];
  const router = {
    listeners: new Map(),
    onExtensionMessage: async (event, extensionId, name, ...args) => { calls.push([event.type, extensionId, name, args]); return { tabs: [1] }; },
    addListener: () => {},
    removeListener: () => {},
  };
  const ses = {
    extensions: { getExtension: (extensionId) => (extensionId === id ? { id } : null) },
    serviceWorkers: { getAllRunning: () => ({}), startWorkerForScope: async () => {} },
  };
  bridge.attach(ses, { ctx: { router } });
  const headers = bridge.tag(ses, { url: bridge.endpoint + "invoke", requestHeaders: { Origin: "x" } });
  assert.ok(headers && headers["x-noor-session"]);
  assert.equal(bridge.tag(ses, { url: "https://example.com/", requestHeaders: {} }), null);
  assert.equal(bridge.tag({}, { url: bridge.endpoint + "invoke", requestHeaders: {} }), null);
  const session = headers["x-noor-session"];
  const origin = `chrome-extension://${id}`;

  const ok = await post(bridge.endpoint + "invoke", { name: "tabs.query", args: [{ active: true }] }, { origin, "x-noor-session": session });
  assert.equal(ok.status, 200);
  assert.deepEqual(JSON.parse(ok.text), { result: { tabs: [1] } });
  assert.equal(ok.allow, origin);
  assert.deepEqual(calls, [["service-worker", id, "tabs.query", [{ active: true }]]]);

  const refused = [
    await post(bridge.endpoint + "invoke", { name: "tabs.query" }, { origin: "https://example.com", "x-noor-session": session }),
    await post(bridge.endpoint + "invoke", { name: "tabs.query" }, { origin: `chrome-extension://${"b".repeat(32)}`, "x-noor-session": session }),
    await post(bridge.endpoint + "invoke", { name: "tabs.query" }, { origin }),
    await post(`http://127.0.0.1:${bridge.port}/wrong/invoke`, { name: "tabs.query" }, { origin, "x-noor-session": session }),
  ];
  assert.deepEqual(refused.map((r) => r.status), [403, 403, 403, 403]);
  assert.equal(calls.length, 1);

  // An event for the worker waits until it asks.
  router.listeners.set("tabs.onActivated", [{ type: "service-worker", extensionId: id }]);
  router.sendEvent(undefined, "tabs.onActivated", { tabId: 7 });
  const events = await post(bridge.endpoint + "events", {}, { origin, "x-noor-session": session });
  assert.deepEqual(JSON.parse(events.text), [["tabs.onActivated", [{ tabId: 7 }]]]);
  bridge.server.close();
});
