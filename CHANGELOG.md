# CHANGELOG

Numbered builds are on GitHub Releases (`1.0.<build>`); each holds Noor,
Noor iPhone and Noor Android for Windows (installer and portable `.exe`).

## Unreleased

- **إصلاح تجمّد Noor (النسخ الثلاث):** كان Noor أحياناً يتجمّد ولا يُغلَق
  (يبقى أكثر من 30 ثانية مع 8 عمليات) بعد تغيير إعداد أو إعادة فتح
  نوافذ البروفايلات. السبب: عمل مؤجَّل (`pushState` في `setImmediate`)
  يصل إلى شريط نافذة أُغلقت، وElectron لا يعطي الـ view أي `webContents`
  بعد ذلك، فيحدث خطأ `TypeError` غير ملتقط؛ ثم تُظهره نافذة الخطأ
  `dialog.showErrorBox` التي توقف التطبيق كله حتى يُضغط OK. الإصلاح:
  `pageOf(view)` في `main/tabs.js` لكل عمل مؤجَّل على الشريط وقائمة النوافذ،
  ونافذة الخطأ بعد جاهزية التطبيق صارت غير حاجبة (`showMessageBox`، واحدة
  في كل مرة). قبل الإصلاح: 2 من 4 تشغيلات لـ `tools/probe-built-app.js`
  على Linux علقت؛ بعده: 0 من 10. (على Windows: يُنتظر تقرير CI.)
- **اختبارات على Windows نفسه** (`.github/workflows/windows-checks.yml`،
  آلة GitHub الافتراضية `windows-latest`): Noor المبني والمثبَّت
  (`tools/check-install.js`: التثبيت الصامت، الاختصارات، قائمة البرامج
  المثبتة، أول تشغيل، بروفايل ثانٍ، العزل، الإعدادات، الإغلاق وإعادة الفتح،
  إزالة التثبيت)، و`tools/probe-built-app.js` (يقود التطبيق المبني عبر
  صفحاته كما يفعل المستخدم)، والكوكيز على القرص (DPAPI)، والـ fuses،
  والـ workers، ومنفذ التصحيح (صفحات الويب والعناوين الأخرى)، وتجربة الـ
  pipe؛ وNoor iPhone
  وNoor Android المبنيين؛ وكل اختبارات Playwright التي كانت تعمل على Linux.
  `tools/run-checks.js` يكتب تقريراً بالعربية لكل اختبار: إصدار Windows،
  إصدار Noor، الأمر، النتيجة، المدة، مكان السجل، والعمليات المتبقية.
- `tools/probe-debug-port.js`: صفحة تعرف منفذ التصحيح وعنوان المتصفح لا
  تستطيع قراءته ولا فتح تبويب ولا الاتصال؛ والمنفذ لا يجيب على عناوين
  الجهاز الأخرى (أي برنامج على الجهاز يستطيع: انظر PROGRESS.md).
- `tools/probe-cookie-store.js` يعمل على Windows أيضاً (إغلاق Noor كما يغلق
  Windows البرامج: `taskkill` بدون /F).

## 1.0.43

- Security (all three builds): cookies are kept encrypted on the disk, as
  Chrome keeps them (on Windows with the user's own key, DPAPI). Before,
  every profile's cookies, logins included, were in plain text in Noor's
  data folder (Electron's default), for any program or copy of the disk
  to read. Cookies already there keep working and are encrypted as their
  site sets them again (Electron can't rewrite them without losing what
  ties a third party's cookie to one site).
- Security (all three builds): no program can get into Noor's main
  process through Noor itself: Noor.exe no longer runs as Node
  (`ELECTRON_RUN_AS_NODE`), and ignores `NODE_OPTIONS` and the `--inspect`
  debugger flags. CI reads these fuses from each built .exe
  (`tools/check-fuses.js`).
- Noor Android: WebGPU's preferred canvas format is Chrome on Android's,
  "rgba8unorm" (on Windows, Chromium answered a PC's "bgra8unorm").
  Noor iPhone: Safari's "bgra8unorm", whatever system Noor runs on.
- `tools/probe-cookie-store.js` (cookies on the disk, and an update over
  old data), `tools/probe-fuses.js` (the three ways into the main
  process); `tools/probe-workers.js` can run a built Noor
  (`NOOR_ELECTRON`).

## 1.0.42

- Workers (all three builds): what Chromium gives a worker only after the
  protection ran in it (WebGPU, Web HID, what a secure context alone has)
  is handled as the worker's own script is about to run: WebGPU's adapter
  info in a worker told this computer's card, now the profile's; Noor
  Android's workers no longer have Web HID; an iOS 16 iPhone's worker no
  longer has WebGPU or Web HID.
- Noor iPhone: WebGPU's adapter info (iOS 26) as Safari's: "apple".

## 1.0.41

- ClientRects (all three builds, and the iPhone app, whose code it is):
  only what fonts decide moves — the width and height of an inline box
  holding text and of a range within one text. A box a page laid out
  (a block, an image, a size like 100.5px), a range holding elements, and
  positions stay exact: a page that set 100.5px read back 100.515625, so a
  site could catch the noise (`tools/probe-lies.js`, now passes in the
  three builds, and checks that text sizes still move).
- `tools/probe-workers.js` starts Noor as a user does (no test tool
  attached), so it checks shared workers truly.

## 1.0.40

- Security: Electron 45.1.0 → 45.2.1 (Chromium 156.0.8078.49 →
  156.0.8078.75, the newest release); adm-zip 0.5.16 → 0.6.1, which
  unpacks extension files (high advisories: memory exhaustion,
  decompression bombs, SUID bits, symlinks). `npm audit --omit=dev`: 0.
- Noor: the battery (`navigator.getBattery()`) reads as a PC's plugged in
  and full, the same in every profile, instead of this computer's own
  level and times, which two profiles read at the same moment would share;
  its own change events are stopped, a page's own events still reach it.
  With Processor & Memory on.
- Shared workers: the connection that protects them is made again if
  Chromium's port answers late or the connection is lost.
- Privacy checks in `tools/probe-*.js` (WebRTC, workers, screen, isolation,
  device APIs, noise, memory).

## 1.0.39

- Noor: **WebGL Vendor & Renderer**, a protection of its own in
  Fingerprint protection (on at first, with New): every profile shows one
  of 26 graphics cards PCs commonly have (NVIDIA, Intel, AMD) as Chrome on
  Windows names them through ANGLE, in WebGL (page, frames, workers) and
  in WebGPU (maker and family). Off, sites see this PC's own card.
- Noor's fingerprint menu names "New Fonts fingerprint" (it read "New
  undefined fingerprint").

## 1.0.38

- Noor Android: 40 phones and 8 tablets, each with the processor it came
  out with (its cores and its graphics); WebGL vendor and renderer as
  Chrome on Android names them through ANGLE, and the same card in
  WebGPU; a WebGL Vendor & Renderer switch; Fonts per profile (Android's
  fonts and a pick of its Noto fonts); profiles made before keep their
  device.

## 1.0.37

- Noor Android: a third build, every profile an Android phone or tablet in
  Chrome.

## 1.0.36

- Collecting cookies never opens a search (Google showed its "unusual
  traffic" page).

## 1.0.35

- Noor iPhone: an iPad profile's window fits its page; "This profile is".

## 1.0.34

- Noor iPhone: profiles can be iPads.
