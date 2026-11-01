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

_In progress._

## Resume point

Next: P0-1 (WebRTC addresses) in PLAN.md.
