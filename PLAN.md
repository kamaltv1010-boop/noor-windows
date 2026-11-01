# PLAN — privacy and fingerprinting work on Noor, Noor Android and Noor iPhone

The three products are three builds of this one repository (Electron on
Windows):

- **Noor** (Windows): every profile is a Windows PC in Chrome.
- **Noor Android**: every profile is an Android phone or tablet in Chrome.
- **Noor iPhone**: every profile is an iPhone or iPad in Safari.

They share the browser, the profiles and the page protection; each shows
sites a different platform, so each is checked on its own.

## How the work is checked

- Local test pages served by a local HTTP server, opened by the real app
  (Electron 45.2.1, Chromium 156) under Xvfb on **Linux**, by the tools in
  `tools/smoke-*.js`, and unit tests (`npm test`) for the main process.
- **Not tested here:** a real Windows PC, a real Android phone, a real
  iPhone. Windows builds the `.exe` files in CI (`npm test` runs there
  too) and reads their fuses; the **Windows checks** job
  (`.github/workflows/windows-checks.yml`) starts the built Noor.exe on a
  Windows virtual machine (no graphics card, not a user's PC) for the
  probes that need no test tool: cookies on the disk (DPAPI), the fuses,
  workers, the debugging port. A check that needs a real PC (its GPU, its
  fonts) is marked as such.
- A fix counts when a test shows the leak before and not after. A build
  that passes is not a privacy result.
- Builds: every push to `main` makes a numbered build (`1.0.<run>`) on
  GitHub Releases. Nothing updates itself on users' PCs. A build is pushed
  only when its tests pass.

## Priorities (most serious first)

Each line: what may leak, why it matters, how it is tested. Status in
PROGRESS.md.

### P0 — leaks that tie profiles together or show the real machine

1. **WebRTC addresses**: ICE candidates may show this PC's local IP (and
   with a STUN server, its public one), the same in every profile. Test:
   a local page gathers candidates with and without a local STUN server;
   look for private IPv4/IPv6 addresses. All three builds.
2. **Workers**: canvas (OffscreenCanvas), WebGL, fonts and audio values
   read in a dedicated, shared or service worker must get the same
   protection as the page; otherwise a worker reads this PC's real values,
   the same in every profile. Test: hash in page and in each worker, in
   two profiles.
3. **Screen size consistency (Noor)**: `screen.width/height` are a common
   PC's, but media queries (`device-width`, `device-height`,
   `device-aspect-ratio`) may still answer with the real screen: a site
   sees both the spoof and the real size. Test: compare in a page.
4. **Profile isolation**: cookies, localStorage, sessionStorage,
   IndexedDB, Cache Storage, the HTTP cache, service workers and
   permissions must not cross profiles or private tabs. Test: write in
   profile A, read in profile B and in a private tab, after a restart too.
5. **Battery (Noor)**: Chrome on a PC answers `navigator.getBattery()`
   with the real level and charging state: the same, at the same moment,
   in every profile.

### P1 — values that single a profile out, or show the protection

6. Media devices (`enumerateDevices`: how many cameras, microphones and
   speakers), keyboard layout (`navigator.keyboard.getLayoutMap`), network
   information: real values, the same in every profile.
7. Noise that a site can catch (ClientRects against `offsetWidth`, canvas
   noise that differs between a page and its worker): a caught lie makes a
   profile stand out more than the value it hides. Measure, then decide
   per build.
8. Secrets: no cookies, tokens or passwords in logs or plain files
   (cookies: encrypted on the disk since the Electron fuses, see
   PROGRESS.md); no way into the app's main process for another program;
   the debugging port only on 127.0.0.1, random, and refused to web
   pages (checked); still open to any program on the PC, other Windows
   accounts' too: a pipe instead of the port, once Windows can be tested
   in CI.
9. Dependencies: Electron/Chromium security releases, `npm audit`.
10. Memory and speed: the page script in every frame, background cookie
    collection, closed tabs and windows.

### P2 — per build

11. Noor Android: what Chromium adds after the protection runs in a
    dedicated worker (Web HID), WebGPU limits; Noor iPhone: the same
    checks against Safari's surface.

## Resume point

See the end of PROGRESS.md.
