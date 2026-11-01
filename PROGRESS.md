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

**Memory and CPU** — `tools/probe-memory.js [build]`: 40 tabs (frames, a
worker, drawing) opened and closed one after another. All three builds: no
closed tab's page left (webContents back to 2), the same 5 processes,
memory +3–4% (Noor 720 → 742 MB, Android 735 → 767, iPhone 734 → 761,
SwiftShader GPU here), main heap +1 MB; one quiet page for 10 s: 0.24–0.31%
CPU in all. No leak found.

**Restart and switches** — `tools/probe-persistence.js [build]`: two
profiles read the same canvas/WebGL hashes, card, text widths, screen,
cores and memory, fonts, battery, user agent and time zone before and after
a restart (Noor, Android, iPhone); each protection turned off (then a
restart) shows this computer's value, on again gives back the profile's own
(Noor: canvas, WebGL Vendor & Renderer, ClientRects, screen, hardware,
fonts; Android: canvas, WebGL Vendor & Renderer, ClientRects, fonts;
iPhone: canvas, ClientRects). Twelve text widths differ between two
profiles (one width alone matches half the time: the noise moves a value
one step up or down). A profile may pick this computer's own screen size:
then off and on look alike (reported, not a fault).

**Permissions** — sites get none of camera, microphone, location,
notifications, screens or local fonts (`queryLocalFonts` only for the
app's own pages); nothing to cross between profiles.

**WebGPU in workers, and what Chromium adds late** — `tools/probe-webgpu.js
[build]` reads WebGPU's adapter info in a page and in its dedicated worker.
Before (commit d7ebe88): the page told the profile's card, **the worker this
computer's** ("google"/"swiftshader" here; a real card on a PC) in Noor and
Noor Android; in Noor iPhone (iOS 26) the page too. A worker gets WebGPU,
and Web HID and the rest a secure context alone has, only after the
protection ran in it (at that point it has not even `setTimeout`), so what
the protection does there was lost: the same reason Noor Android's worker
still had Web HID, and an iOS 16 iPhone's worker kept `GPU` and `HID`.
**Fixed:** the protection hands back its late part (`protectPage` returns
it; `scripts/parts/*.js` leave work in `lateTasks`); Noor holds each worker
again right before its own script runs (V8's "before script execution"
breakpoint), runs that part, and turns the debugger off before the worker's
first line (`Tab.atScriptStart`, `BrowserDebugger.runLate` for shared and
service workers). After: page and worker tell the same card in all three
builds (Noor: the profile's NVIDIA/Intel/AMD; Android: the device's,
subgroups 16/16 on Valhall; iPhone iOS 26: "apple" ×4, subgroups 32 as
WebKit gives); Noor Android's workers have no Web HID (the exception in
`tools/smoke-android.js` is gone); an iOS 16 iPhone's worker has no `GPU`
nor `HID`. Noor iPhone's page now names WebGPU's adapter as Safari does
(WebKit `GPUAdapterInfo.h`: vendor, architecture, device and description
are all the first word of the Metal device's name, "apple").

Full run on the late worker step: 27 app tests and probes pass —
smoke-electron, -extensions (extension service workers), -quota (service
worker), -windows, -gpu, -fonts, -menu (Noor and iPhone), -warmup (Noor
and Android), -iphone (iPhone, iPad), -android (phone, tablet);
probe-workers (now with WebGPU in dedicated, shared and service workers,
started as a user starts Noor) and probe-webgpu in the three builds,
probe-device, probe-lies ×3, probe-isolation, probe-screen, probe-webrtc.

**WebGPU's preferred canvas format** — `navigator.gpu.getPreferredCanvasFormat()`
is one line a site can read. Chromium answers by the system it runs on
(`gpu.cc`, read from Chromium's source: "rgba8unorm" on Android and Linux,
"bgra8unorm" elsewhere), Safari "bgra8unorm" on every Apple GPU (WebKit's
`GPU::getPreferredCanvasFormat`, read from WebKit's source). So on Windows
Noor Android answered a PC's "bgra8unorm" where Chrome on an Android phone
answers "rgba8unorm", and Noor iPhone answered whatever the PC's system
gives. **Fixed:** Noor Android answers "rgba8unorm", Noor iPhone
"bgra8unorm" (page and worker, the native method still checks its
`this`); Noor keeps Chromium's own (BGRA on Windows, as Chrome there).
Before/after shown here for Noor iPhone (this Linux machine's Chromium
answers "rgba8unorm": after, page and worker "bgra8unorm"); Noor Android's
answer was already RGBA here, so its before can only be read in Chromium's
source, not shown on this machine. `tools/probe-webgpu.js` checks the
format in the three builds (Noor's only on Windows). Regressions after the
change: unit tests 139/139; smoke-electron, -gpu, -iphone (iPhone, iPad),
-android (phone, tablet), probe-workers ×3, probe-lies ×3 pass.

**Cookies on the disk** (P1-8) — `tools/probe-cookie-store.js`: Noor is
started as a user starts it, a page sets a cookie with a secret value for
an hour, Noor is asked to quit, and every file in its data folder is
searched for the secret. **Before** (Electron 45.2.1 as `npm start` runs
it, the same fuses as every build until now): the secret is in
`Partitions/noor-default/Cookies` as it is (value column 33 bytes,
encrypted column empty): every profile's logins were readable by any
program, backup or copy of the disk. Electron keeps cookies so unless the
app is built with its EnableCookieEncryption fuse. **Fixed:** the build
flips it (package.json `build.electronFuses`, which Noor iPhone's and Noor
Android's builds take too). **After** (Noor built here with the same
config, `npx electron-builder --linux dir`): the cookie is stored
encrypted ("v10", 83 bytes; Chromium's own format, on Windows with a key
DPAPI keeps for the user), and the secret is in no file. **Update over old
data** (`--after`): a cookie set by today's Noor still reaches its site
after the new one starts on the same data, and the new one is encrypted;
the old one stays in plain text until its site sets it again (Electron
encrypts as it writes; rewriting all cookies through Electron's API would
drop what ties a third party's cookie to one site, CHIPS, so it isn't
done). Not tested on Windows itself (DPAPI): CI checks the fuse in each
built .exe.

**Getting into Noor's main process** — the same build turns off three
ways for another program to run code inside Noor: before (Electron as it
comes), `ELECTRON_RUN_AS_NODE=1` ran a script as Node, `NODE_OPTIONS
--require` loaded a file into the app, and `--inspect=9339` opened a Node
debugger on that port; after (the built app), none (`tools/probe-fuses.js
[electron]`, exits 1 before, 0 after; here on Linux). The app forks no Node process, so nothing in it
used these. The built app still protects every kind of worker
(`NOOR_ELECTRON=… tools/probe-workers.js windows`: page, dedicated, shared
and service worker give the profile's canvas, WebGL and card, different in
two profiles, this computer's with the protections off). CI now reads the
four fuses from Noor.exe, Noor iPhone.exe and Noor Android.exe after each
build (`tools/check-fuses.js`, exits 1 if one isn't as asked). Left as
Electron has them: ASAR integrity and app-from-ASAR only (need checking on
Windows itself), file:// privileges.

## Resume point

Next: check that pages can't reach Chromium's debugging port (P1-8:
`/json`, the browser's WebSocket; the port is random, on 127.0.0.1).
Then WebGPU's adapter features and limits, still this PC's in Noor Android
and Noor iPhone (a phone lists no ASTC, a PC's BC formats show): adding
formats the PC can't use would break pages that ask for them, so at most
BC can be taken away — decide and test. Then the time zone watcher's
30-second poll (CPU, network, battery).
