# PROGRESS

What was done, how it was tested, and where to pick up. Tests here ran on
Linux (Electron under Xvfb) unless said otherwise: no real Windows PC,
Android phone or iPhone was used.

## 2026-11-01

### Done before the audit

- 1.0.38 (Noor Android, 40 phones): unit tests 136/136; app tests on
  Galaxy A15, Pixel 8 (9 cores), Galaxy S25, Redmi 13C, POCO X5 Pro,
  Nothing Phone (2), Galaxy Tab A9+, Xiaomi Pad 6, Pixel 7 Pro, Pixel
  Tablet, and with WebGL Vendor & Renderer off; Noor and Noor iPhone
  regressions pass.
- 1.0.39 (Noor's WebGL Vendor & Renderer): `tools/smoke-gpu.js` — a page,
  a WebGL2 context and a worker see the profile's card only after asking
  for WEBGL_debug_renderer_info; WebGPU's adapter info matches; New gives
  another card; a second profile has its own; off shows the real card
  (here SwiftShader). Unit tests 137/137; smoke-electron, smoke-menu,
  smoke-fonts, smoke-warmup, smoke-iphone, smoke-android pass.

### Audit (see PLAN.md for the order)

Each check is a tool in `tools/` that exits 1 when it finds the problem,
so it can be run again after any change.

**P0-1 WebRTC addresses** — `tools/probe-webrtc.js [windows|iphone|android]`
(a local STUN server on this machine's own address, 192.0.2.2):

- All three builds: host candidates carry an mDNS name (`<uuid>.local`),
  never the raw address; the related address of a STUN candidate is
  `0.0.0.0`. The mDNS name differs between two profiles and a private tab
  (no join by it). Same as Chrome's default. **No leak found.**
- The STUN (srflx) candidate shows the address the STUN server sees: the
  public IP in real use, the one HTTP shows too. Noor has no proxy of its
  own, so nothing differs from HTTP. If a proxy is ever added, WebRTC must
  be limited to it (`disable_non_proxied_udp`).
- Tested on Linux with one interface; Windows with several interfaces and
  IPv6 was not tested (the same Chromium code decides).

**P0-2 Workers** — `tools/probe-workers.js` (Playwright) and a run with the
app started as a user starts it (no test tool attached):

- Started normally, all three builds: canvas, WebGL and font checks in a
  dedicated worker, a shared worker and a service worker give what the page
  gives (protected, per profile). **No leak.**
- Under Playwright (which attaches its own debugger to the browser), the
  shared worker read this machine's real canvas/WebGL hashes and fonts, the
  same in two profiles. The cause is the second debugger, not Noor in
  normal use; but it showed that shared workers depend on one connection
  (Noor's own debugging target), made once at start with nothing to fall
  back on. **Fixed:** `BrowserDebugger.keepConnected` connects again if the
  port answers late or the connection is lost
  (`test/browser-debugger.test.js`, 2 new tests). Remaining limit: a shared
  worker of a page opened while that connection is down is not protected
  (documented); a developer's or a test tool's own debugger can get in the
  way the same way.

**P0-3 Screen (Noor)** — `tools/probe-screen.js`: `screen.width/height`,
`device-width`, `device-height`, `device-aspect-ratio`, `min-device-width`
and a stylesheet's `@media` all give the profile's screen (2560×1080 on a
1920×1080 display), in a page and a frame; off, all give the real one.
**Consistent, no leak.**

**P0-4 Isolation** — `tools/probe-isolation.js [windows|iphone|android]`:
a cookie, localStorage, sessionStorage, IndexedDB, Cache Storage, a
service worker and the HTTP cache written in one profile are not found in
a second profile nor in a private tab; a shared worker and a
BroadcastChannel don't join two profiles; after a restart the second
profile still has nothing of the first. **No leak.**

**Security update** — Electron 45.1.0 (Chromium 156.0.8078.49) →
**45.2.1 (Chromium 156.0.8078.75)**, the newest release (2026-10-31).
`npm audit`: adm-zip 0.5.16 (runtime: unpacks extension files) had high
advisories (crafted ZIP memory exhaustion, decompression-bomb bypass,
SUID/SGID bits kept, symlink overwrite); **→ 0.6.1**, same API (checked
alone, then `tools/smoke-extensions.js` passes: folder, .crx, store,
update). `npm audit --omit=dev`: 0 vulnerabilities. Left: 15 moderate in
electron-builder's tree (build time only, not shipped).

**P0-5 Battery (Noor)** — Chrome on Windows gives `getBattery()` this
computer's level, charging state and times: at the same moment, the same
in every profile (it can't be shown here: this machine has no battery, so
Chromium reads "plugged in, full"). **Fixed** (`scripts/parts/battery.js`,
with Processor & Memory): every profile reads a PC plugged in and full; the
battery's own change events are stopped by a listener added first, a
page's own events still reach its listeners, `getBattery()` returns the
same promise each time, getters refuse a wrong `this` and read as native.
Noor Android keeps a phone's battery per profile; Noor iPhone has none.
`tools/probe-device.js` checks it in all three builds.

A first version replaced `addEventListener` and **broke every page's
listeners** in Noor: a listener added from the protection's own realm
(removed before the page runs) is never called. Caught by
`tools/probe-device.js` and by `tools/smoke-quota.js` (its service worker
stopped answering), before any build; replaced by the version above.
`tools/smoke-electron.js` now checks that a page's listeners fire.

**P1-6 Device APIs** (`tools/probe-device.js`, for the record): media
devices empty here (no camera or microphone; Chrome gives no ids or labels
without permission); keyboard layout (US here) and network values are this
machine's, as in Chrome — the same in every profile, low in what they
tell. Not changed.

**P1-7 Noise a site can catch** — `tools/probe-lies.js [build]`, each
check against the same check with every noise off:

- Canvas: two reads, `getImageData` against `toDataURL` drawn back — not
  caught. (A GPU canvas reads back slightly differently the second time
  in Chromium itself, with the noise off too.)
- Audio: `getChannelData` against `copyFromChannel`, two renders — not
  caught. WebGL: `readPixels` against `toDataURL` — not caught.
- **ClientRects: caught in all three builds** — an element a page made
  100.5px wide measured 100.515625 (100.5 with the noise off). The noise
  moved every fractional size, including sizes a page set itself.
  **Fixed** in the shared source (the iPhone app's
  `FingerprintProtection.swift`): only the width and height of an inline
  box holding something and of a range within one text node move; blocks,
  images, empty or padded boxes, ranges holding elements and all positions
  stay exact. After: the 100.5px box reads 100.5; a span's text width
  still moves (137.6875 → 137.703125 in one profile, 137.671875 in
  another), and the span and the range over its text agree. probe-lies
  passes in the three builds; smoke-iphone (iPhone, iPad), smoke-android
  (phone, tablet), smoke-electron, smoke-menu and smoke-extensions pass.
  (Found on the way: Chromium keeps a range's `startContainer` getter on
  `Range.prototype`, not `AbstractRange.prototype`; the check looks along
  the prototype chain.) The iPhone app gets the same change; it is
  compiled by its own CI (unsigned IPA), not tested on an iPhone here.

**Workers, again** — `tools/probe-workers.js` now starts Noor as a user
does: in Noor (Windows), page, dedicated, shared and service worker give
the same protected canvas and WebGL hashes, different in two profiles and
from the real ones; fonts hidden the same way in each.

**Secrets** — the app writes no log but uncaught errors (to stderr), no
cookies or tokens; history skips private and background tabs; exporting
cookies writes a file only where the user picks one. Nothing to fix.

**Memory and CPU** — `tools/probe-memory.js` written, not run yet.

## Resume point

Next: `tools/probe-memory.js` (memory and CPU, PLAN P1-10) in the three
builds; then the time zone watcher's 30-second poll (CPU, network,
battery); then P2 (per build).
