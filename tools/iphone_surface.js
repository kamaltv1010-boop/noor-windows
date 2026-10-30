// Builds scripts/parts/iphone-surface.js: what this app's Chromium shows a
// page that Safari on an iPhone doesn't, and from which iOS version Safari
// has it, so Noor iPhone can take away what an iPhone of a given version
// wouldn't have (see scripts/parts/iphone.js).
//
// Usage: node tools/iphone_surface.js <surface.json> <browser-compat-data/data.json>
//
// <surface.json> is what tools/dump-surface.js lists, run with the app's
// Electron; <data.json> is MDN's browser compatibility data
// (npm package @mdn/browser-compat-data), which says, for each feature,
// from which Safari on iOS version it is there. Rerun both when Electron
// is updated.
"use strict";
const fs = require("fs");
const path = require("path");

const surface = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const bcd = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const out = path.join(__dirname, "..", "scripts", "parts", "iphone-surface.js");

/// iPhone and iPad share BCD's "safari_ios"; what is there on an iPad only
/// (or only in a web app saved to the home screen) an iPhone's Safari
/// doesn't have.
const NOT_ON_IPHONE = /not on iPhone|iPad but not on iPhone|only on iPad|unless the page is a web app saved to the home screen/i;

const textOf = (notes) => [].concat(notes || []).join(" ");

/// When Safari on an iPhone has a feature, as BCD says it: the stretches
/// of iOS versions it is there in, each [from, until) with "" for open, or
/// [] for never; null when BCD doesn't say. (A feature BCD shows first in
/// part and then in full, or moved, is there from its first version on.)
const stretches = (node) => {
  const compat = node && node.__compat;
  if (!compat) return null;
  const support = compat.support && compat.support.safari_ios;
  if (!support) return null;
  let known = false;
  const list = [];
  for (const statement of [].concat(support)) {
    if (statement.flags || statement.prefix || statement.alternative_name) continue;
    const added = statement.version_added;
    if (added === false) {
      known = true;
      continue;
    }
    if (added === null || added === undefined || added === "preview") continue;
    known = true;
    if (NOT_ON_IPHONE.test(textOf(statement.notes))) continue;
    const from = added === true ? "1" : String(added).replace("≤", "");
    const until = statement.version_removed ? String(statement.version_removed).replace("≤", "") : "";
    list.push([from, until]);
  }
  if (!known) return null;
  // Merged, oldest first: [3.2, 18.4) and [18.4, ) are [3.2, ).
  list.sort((a, b) => compare(a[0], b[0]));
  const merged = [];
  for (const [from, until] of list) {
    const last = merged[merged.length - 1];
    if (last && (last[1] === "" || compare(from, last[1]) <= 0)) {
      if (last[1] !== "" && (until === "" || compare(until, last[1]) > 0)) last[1] = until;
    } else {
      merged.push([from, until]);
    }
  }
  return merged;
};

/// The stretches as the page script reads them, for the iPhones in the
/// list (none older than `OLDEST`): "" for never, "17.4" from 17.4 on,
/// "-17.2" until 17.2, "17-18" from 17 until 18, several joined by "|";
/// null when every one of them has it.
const OLDEST = "16.6";
const encode = (list) => {
  if (list === null) return null;
  const kept = list
    .filter(([, until]) => until === "" || compare(until, OLDEST) > 0)
    .map(([from, until]) => [compare(from, OLDEST) <= 0 ? "" : from, until]);
  if (!kept.length) return "";
  if (kept.length === 1 && kept[0][0] === "" && kept[0][1] === "") return null;
  return kept.map(([from, until]) => (until ? `${from}-${until}` : from)).join("|");
};
const since = (node) => encode(stretches(node));

const compare = (a, b) => {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
};

/// Kept whatever BCD says: what Safari has but BCD files elsewhere or
/// gets wrong (the plugin list Safari shows again since iOS 16, where BCD
/// still has the old plugins gone; event handlers, which stay on the
/// object where the event never fires, as beforeunload on iOS).
const KEEP = new Set(["MimeType", "Plugin", "PluginArray", "MimeTypeArray", "constructor", "prototype", "length", "name", "arguments", "caller"]);
/// Interfaces whose members stay: an iPhone has no MediaSource of its own,
/// but its ManagedMediaSource is one (scripts/parts/iphone.js makes it from
/// Chromium's), so only the globals go; the plugin list is Safari's too.
const KEEP_MEMBERS_OF = new Set(["MediaSource", "SourceBuffer", "SourceBufferList", "MimeType", "Plugin", "PluginArray", "MimeTypeArray"]);
/// Single members kept: cssFloat moved in Safari 26 to the style's own
/// interface, where a page still reads it on an element's style.
const KEEP_MEMBER = new Set(["CSSStyleDeclaration.prototype.cssFloat"]);

/// Chromium's own, which BCD doesn't list (never on an iPhone).
const CHROMIUM_ONLY = {
  globals: [
    "chrome", "webkitRTCPeerConnection", "webkitMediaStream", "webkitSpeechGrammar", "webkitSpeechGrammarList",
    "webkitSpeechRecognitionError", "webkitSpeechRecognitionEvent", "webkitRequestFileSystem",
    "webkitResolveLocalFileSystemURL", "VirtualKeyboardGeometryChangeEvent", "IntegrityViolationReportBody", "NodeRange",
    "OpaqueRange", "TimelineTrigger", "TimelineTriggerRange", "TimelineTriggerRangeList", "DevicePosture",
    "XRDOMOverlayState", "onpointerrawupdate", "onbeforexrselect", "ondeviceorientationabsolute", "onappinstalled",
    "onbeforeinstallprompt", "oncontentvisibilityautostatechange", "onbeforematch", "onscrollsnapchange",
    "onscrollsnapchanging", "oncommand", "Temporal", "DisposableStack", "AsyncDisposableStack", "SuppressedError",
  ],
  "Navigator.prototype": ["webkitTemporaryStorage", "webkitPersistentStorage", "webkitGetUserMedia", "deprecatedURNToURL", "devicePosture"],
  "Screen.prototype": ["onchange"],
  // The Fullscreen API is on an iPad only; an iPhone shows a video full
  // screen through the video's own webkitEnterFullscreen().
  "Element.prototype": ["webkitRequestFullscreen", "webkitRequestFullScreen", "onwebkitfullscreenchange", "onwebkitfullscreenerror", "onfullscreenchange", "onfullscreenerror", "oncommand", "onbeforematch", "oncontentvisibilityautostatechange", "onpointerrawupdate", "onscrollsnapchange", "onscrollsnapchanging"],
  "HTMLElement.prototype": ["oncommand", "onbeforematch", "oncontentvisibilityautostatechange", "onpointerrawupdate", "onscrollsnapchange", "onscrollsnapchanging", "onbeforexrselect"],
  "Document.prototype": ["webkitIsFullScreen", "webkitCurrentFullScreenElement", "webkitFullscreenEnabled", "webkitFullscreenElement", "onwebkitfullscreenchange", "onwebkitfullscreenerror", "webkitCancelFullScreen", "webkitExitFullscreen", "onfullscreenchange", "onfullscreenerror", "oncommand", "onbeforematch", "oncontentvisibilityautostatechange", "onpointerrawupdate", "onscrollsnapchange", "onscrollsnapchanging", "onbeforexrselect", "onfreeze", "onresume", "onprerenderingchange", "onpointerlockchange", "onpointerlockerror"],
  "WorkerNavigator.prototype": ["devicePosture"],
};

/// WebGPU's constant objects go with WebGPU (iOS 26).
const WITH = { GPUBufferUsage: "GPU", GPUColorWrite: "GPU", GPUMapMode: "GPU", GPUShaderStage: "GPU", GPUTextureUsage: "GPU" };

const api = bcd.api;
const builtins = bcd.javascript.builtins;

const table = {};
const put = (where, name, version) => {
  if (KEEP.has(name) || version === null || KEEP_MEMBER.has(`${where}.${name}`)) return;
  if (where !== "window" && where !== "worker" && KEEP_MEMBERS_OF.has(where.split(".")[0])) return;
  (table[where] = table[where] || {})[name] = version;
};

// What the iPhone has from `version` on: kept for newer devices, taken
// away below that. Only what Chromium has is listed.
const globalSince = (name, scope) => {
  if (/^on/.test(name)) return null;
  if (WITH[name]) return since(api[WITH[name]]);
  if (api[name]) return since(api[name]);
  if (builtins[name]) return since(builtins[name]);
  const members = scope === "worker" ? [api.WorkerGlobalScope, api.DedicatedWorkerGlobalScope] : [api.Window];
  for (const owner of members) {
    if (owner && owner[name]) return since(owner[name]);
  }
  return null;
};

for (const scope of ["window", "worker"]) {
  const dump = surface[scope];
  for (const name of dump.globals || []) {
    put(scope, name, globalSince(name, scope));
  }
  for (const name of CHROMIUM_ONLY.globals) {
    if ((dump.globals || []).includes(name)) put(scope, name, "");
  }
  for (const [name, own] of Object.entries(dump.interfaces || {})) {
    const node = api[name];
    if (!node) continue;
    const at = (member) => (/^on/.test(member) ? null : since(node[member]));
    for (const member of own.own || []) {
      put(`${name}`, member, at(`${member}_static`) !== null ? at(`${member}_static`) : at(member));
    }
    for (const member of own.prototype || []) {
      put(`${name}.prototype`, member, at(member));
    }
  }
  for (const [name, own] of Object.entries(dump.builtins || {})) {
    const node = builtins[name];
    if (!node) continue;
    for (const member of own.own || []) put(name, member, since(node[member]));
    for (const member of own.prototype || []) put(`${name}.prototype`, member, since(node[member]));
  }
}
for (const [where, names] of Object.entries(CHROMIUM_ONLY)) {
  if (where === "globals") continue;
  const [name] = where.split(".");
  const present = new Set([].concat(
    ((surface.window.interfaces[name] || {}).prototype) || [],
    ((surface.worker.interfaces[name] || {}).prototype) || [],
  ));
  for (const member of names) {
    if (present.has(member)) put(where, member, "");
  }
}

for (const where of Object.keys(table)) {
  if (!Object.keys(table[where]).length) delete table[where];
}

const sorted = Object.fromEntries(Object.keys(table).sort().map((where) => [where, Object.fromEntries(Object.keys(table[where]).sort().map((n) => [n, table[where][n]]))]));
const body = JSON.stringify(sorted, null, 0).replace(/\},"/g, '},\n  "').replace(/^\{/, "{\n  ").replace(/\}$/, "\n}");
const source = `// Generated by tools/iphone_surface.js from Chromium ${surface.chrome} and MDN's
// browser compatibility data. Don't edit by hand; rerun the tool.
//
// What a page sees in this app's Chromium and Safari on an iPhone lacks,
// by where it is (the window's globals, a worker's, an interface's own
// properties or its prototype's), with the iOS versions Safari has it in:
// "" for never, "17.4" from 17.4 on, "-17.2" until 17.2, "17-18" from 17
// until 18, several joined by "|". See scripts/parts/iphone.js.
const IPHONE_SURFACE = ${body};
`;
fs.writeFileSync(out, source);
const count = Object.values(sorted).reduce((n, names) => n + Object.keys(names).length, 0);
console.log(`wrote ${out}: ${count} names in ${Object.keys(sorted).length} places, ${source.length} chars`);
