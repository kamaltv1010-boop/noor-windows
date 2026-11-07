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

**Chromium's debugging port** (P1-8) — `tools/probe-debug-port.js`: Noor
is started as a user starts it; the port and the browser's address are
read from `DevToolsActivePort` (Chromium writes it in the data folder) and
given to a page, the worst case. The page, served as a local page and then
as a site on the internet, can't read `/json/version` (no CORS), can't open
a tab (`PUT /json/new`, blocked), and its WebSocket to the browser is
refused (Chromium refuses one that carries a page's Origin). A no-cors
request still gets an answer it can't read, so a site scanning ports
20000–39999 could learn that something listens there (Electron doesn't
apply Chrome's Local Network Access: the "internet" run answered the
same). The port doesn't answer on this computer's other address
(192.0.2.2): 127.0.0.1 only. **Not fixed, a limit:** any program on the
PC can connect to the port and so control Noor while it runs (pages, every
profile's cookies, decrypted). The user's own programs can read the
profile's files anyway; but on a PC with several Windows accounts,
another account's programs can too (127.0.0.1 is the same for all). The
port is how shared workers get the protection: a tab's own debugger
reaches its service worker but not a shared worker, and Electron's
in-app debugger may not attach to the browser
(`Target.attachToBrowserTarget`: "Not allowed"; both tried here). The fix
would be Chromium's pipe instead of a port (`--remote-debugging-pipe` with
`--remote-debugging-io-pipes`, read in Chromium's source): how the app
opens the pipes' ends on Windows must be tested on Windows itself, so a
Windows test job in CI comes first.

## 2026-11-01 (مساءً) — الاختبار على Windows نفسه

**بيئة Windows المتاحة:** الحاوية التي أعمل فيها Linux (Ubuntu 24.04) بلا
KVM ولا Wine ولا آلة افتراضية، ولا جهاز متصل عبر Remote Control. البيئة
الوحيدة بنظام Windows هي آلة GitHub Actions الافتراضية `windows-latest`
(Microsoft Windows Server 2025، صورة `windows-2025-vs2026` الإصدار
`20261021.278.1`): ليست جهاز مستخدم، بلا بطاقة رسوميات.

**أول دليل من Windows (البناء 1.0.43، التشغيل 41348741347):** `npm test`
‏139/139؛ و`tools/check-fuses.js` على `Noor.exe` و`Noor iPhone.exe`
و`Noor Android.exe` المبنية: تشفير الكوكيز مفعّل، و`runAsNode`
و`NODE_OPTIONS` و`--inspect` معطّلة في الثلاثة (قراءة من ملف الـ exe، ليست
تشغيلاً للتطبيق).

**خلل وُجد وأُصلح: تجمّد Noor وعدم إغلاقه** — `tools/probe-built-app.js`
(يقود Noor المبني عبر صفحاته: بروفايل ثانٍ، صفحة في كل بروفايل، العزل،
الصلاحيات، تغيير إعداد، إغلاق وإعادة فتح). **قبل** (Linux، Noor مبني): في 2
من 4 تشغيلات بقي Noor يعمل أكثر من 30 ثانية بعد طلب الإغلاق مع 8 عمليات،
أو علق نداء `settings:set`. في سجل Noor:
`TypeError: Cannot read properties of undefined (reading 'isDestroyed') at
main/tabs.js:1715` — عمل مؤجَّل (`pushState` في `setImmediate`) يصل إلى
شريط نافذة أُغلقت، وElectron لا يعطي الـ view أي `webContents` بعدها؛
والخطأ غير الملتقط تُظهره `dialog.showErrorBox` التي توقف التطبيق كله حتى
يُضغط OK. **الإصلاح:** `pageOf(view)` في `main/tabs.js` لكل وصول مؤجَّل إلى
صفحة الشريط أو صفحة القوائم (و`main.js` لـ `fontsKnown`)، ونافذة الخطأ بعد
جاهزية التطبيق صارت `showMessageBox` غير حاجبة (واحدة في كل مرة).
**بعد** (Linux): 0 من 10 تشغيلات علقت، 0 أخطاء غير ملتقطة في سجلات Noor
(صار `probe-built-app.js` يفحص سجل Noor بعد كل إغلاق). على Windows: يُنتظر
تقرير CI. (تشغيل واحد فشل بعد الإصلاح كان من الاختبار نفسه: تبويبات تعيد
فتحها إعادة التشغيل أرسلت تقاريرها أثناء زيارة؛ صار لكل زيارة علامة.)

**أدوات اختبار Windows:** `tools/run-checks.js` (تقرير عربي: إصدار Windows،
إصدار Noor، الأمر، النتيجة، المدة، السجل، العمليات المتبقية)،
`tools/checks/windows-*.json`، `tools/check-install.js` (المثبّت)،
`.github/workflows/windows-checks.yml` (أربع مهام، على الفرع
`windows-checks` حتى لا يُصدر نسخة).

**الأدوات والـ Skills (طلب المستخدم):** بحثت في Skills الحساب (لا شيء
مثبّت لهذه الحاجات) وفي دليل Anthropic للإضافات: **Security Guidance**
و**code-review** من نشر Anthropic نفسها (الأوثق؛ code-review يعتمد على عدة
agents)، و**finecomb** (مراجعة كود وأمان شاملة، للقراءة فقط، بلا agents،
مجتمعية مراجَعة في الدليل)، و**Security Audit Loop** (يغلّف أدوات مفتوحة
المصدر لفحص الأسرار والتبعيات، مجتمعية). عُرضت بطاقة تثبيتها على المستخدم
(التثبيت بموافقته). استُعمل الآن ما لا يحتاج تثبيتاً في الحساب:
- **secretlint 13.1.0** (MIT، github.com/secretlint/secretlint، من npm في
  مجلد منفصل `/tmp/tools/secretlint`؛ Gitleaks تعذّر تنزيله: وكيل GitHub في
  هذه البيئة يقصر الوصول على مستودعات الجلسة، 403). اختبار ضبط: يكتشف رمز
  GitHub مزيفاً (رمز الخروج 1). النتيجة: noor-windows (145 ملفاً حالياً،
  وتاريخ git كامل: 44 commit) و Amir (54 ملفاً، 57 commit): **لا سرّ**
  (رمز الخروج 0). (المستودع androi.noor لم يُفحص: ليس في الجلسة.)
- **npm audit:** تبعيات Noor التي تُشحن معه: 0 ثغرات. أدوات البناء: 15
  متوسطة، كلها من `minimatch` (بطء مع أنماط glob خبيثة) داخل electron-builder؛
  تعمل وقت البناء على أنماطنا نحن فقط: خطر ضئيل، تُركت.

**شعار لكل متصفح (طلب المستخدم):** Noor بنفسجي بدرع (كما كان)، Noor iPhone
أزرق فيه iPhone (Dynamic Island)، Noor Android أخضر فيه هاتف Android (ثقب
الكاميرا)؛ النجمة البرتقالية في الثلاثة. `build/icon-*.svg` →
`tools/make-icons.js` (كل حجم يُرسم بحجمه: 16…256) → `.ico`. تأخذه كل نسخة
في الـ exe والمثبّت والاختصارات (`win.icon`) وفي نوافذها وشريط المهام
(`mobile.iconPath`). `test/icons.test.js` (141/141 مع الباقي)؛ على Windows:
`tools/check-icons.js` يقارن ما يُظهره Windows من كل exe بشعاره (يُنتظر).

**المهارات (Skills) المجهّزة للمشاريع** — الفرق: المهارة تعليمات (متى تُشغَّل
أداة وكيف تُقرأ نتيجتها)، والأداة هي البرنامج الذي يعمل فعلاً.

| المهارة | المصدر | الوظيفة | الأدوات التي تشغّلها | الحالة |
|---|---|---|---|---|
| `noor-security-scan` | محلية: `.claude/skills/` في المشروع | الأسرار، التبعيات، إعدادات الـ exe | secretlint 13.1.0 (MIT)، `npm audit`، `tools/check-fuses.js` | مثبّتة ومعروفة للبيئة؛ التجربة: الضبط 1، الملفات 0، التاريخ (48 commit) 0، الثغرات المشحونة 0، الـ fuses 0 |
| `noor-checks` | محلية | الخصوصية والاستقرار على Linux وWindows | `tools/run-checks.js` وحزم `tools/checks/`، Playwright 1.63، xvfb | مثبّتة ومعروفة للبيئة؛ التجربة على Linux أدناه |
| `security-review`، `code-review`، `simplify` | مدمجة في Claude Code (Anthropic) | مراجعة الأمان والفروق والجودة | Git | متاحة (code-review في المستويات العالية يستعمل عملاء فرعيين) |
| Security Guidance | دليل Anthropic، نشر Anthropic | تحذيرات أمنية عند التعديل | hooks | بطاقة التثبيت عُرضت؛ لم تُثبّت (تحتاج موافقة المستخدم) |
| finecomb | دليل Anthropic، مجتمعية مراجَعة | قائمة تدقيق كود وأمان شاملة، للقراءة فقط | — | لم تُثبّت |
| Security Audit Loop | دليل Anthropic، مجتمعية | أدوات فحص مفتوحة المصدر في حلقة | أدوات خارجية | لم تُثبّت |

ما لا تغطيه مهارة موثوقة بعد: أمان تطبيقَي Android وiOS الأصليين (المستودع
`androi.noor` ليس في الجلسة؛ تطبيق iOS في المستودع Amir فُحصت أسراره فقط)،
والبحث في CVE (يُستعمل البحث في الويب والمصادر الرسمية مباشرة).

## 2026-11-01 (ليلاً) — نتائج Windows، وما أُصلح بسببها

كل التشغيلات على آلة GitHub الافتراضية `windows-latest` (Windows Server 2025
Datacenter 10.0.26100، صورة 20261021.278.1، جلسة تفاعلية رقم 2، شاشة
1024×768، بلا بطاقة رسوميات)، Noor 1.0.43 + التعديلات، Electron 45.2.1
(Chromium 156). الأمر في كل مهمة: `node tools/run-checks.js
tools/checks/<الحزمة>.json`؛ السجل: سجل المهمة على GitHub (الجدول العربي في
آخره، وآخر سطور كل اختبار فاشل)، والـ artifact `checks-<الحزمة>`.

| التشغيل | الـ commit | Noor المبني والمثبَّت | iPhone وAndroid المبنيان | كود Noor | كود iPhone/Android |
|---|---|---|---|---|---|
| 41352822447 | — | 5 من 10 | 5 من 11 | 14 من 19 | 15 من 21 |
| 41353599371 | — | 6 من 11 | 5 من 11 | 14 من 19 | 15 من 21 |
| 41355238850 | `340f2d4` | فشل install وbuilt-app بإنذارين كاذبين | 5 من 11 | 15 من 19 | 19 من 21 |
| 41356355550 | `6284578` | 6 من 9 | 8 من 11 | 16 من 19 | 19 من 21 |
| 41358672335 | `6c39eff` | 8 من 9 (فشل install) | 10 من 11 (فشل install-iphone) | 19 من 20 (فشل smoke-close: خطأ في الاختبار) | 21 من 21 |
| 41359887145 | `d15442a` | 8 من 9 (install: النافذة لم تُنتظر) | 10 من 11 (install-iphone: كذلك) | 19 من 20 (smoke-close: taskkill) | 21 من 21 |
| 41361145575 | `05ebf3c` | **9 من 9** | **11 من 11** | **20 من 20** | **21 من 21** |
| 41361855546 | `f2e8567` | **9 من 9** | **11 من 11** | **21 من 21** (ومعه smoke-session-end) | **21 من 21** |
| 41365466704 | `dd839ba` | **9 من 9** | **11 من 11** | **22 من 22** (ومعه probe-navigation-source) | **21 من 21** |

**المفضلة والروابط المثبّتة (طلب المستخدم، 2026-11-02):** قال إن Instagram يعرف
أنه دخل من المفضلة لا بكتابة العنوان. القياس (`tools/probe-navigation-source.js`،
خمس طرق في تبويب جديد: الشريط، صندوق صفحة البداية، مربع المفضلة، المفضلة في
المكتبة، الرابط المثبّت): ما يُرسل إلى الموقع وما تقرؤه الصفحة متطابق في الخمس،
على Linux وعلى Windows (التشغيل 41365466704)، كما في Chrome: `Sec-Fetch-Site:
none` و`Sec-Fetch-User: ?1` بلا `Referer`، و`document.referrer` فارغ، ونوع التنقّل
navigate. (بموقع http عادي لا تُرسل ترويسات Sec-Fetch أصلاً، فالقياس على
127.0.0.1، سياق آمن كموقع https.) ما يختلف هو العنوان المحفوظ: المفضلة تحفظ
العنوان الرسمي للصفحة (canonical)، فمفضلة صفحة الدخول تفتح صفحة الدخول. الجديد:
الروابط المثبّتة (Pin) كتطبيق iPhone، تُحفظ بلا رموز التتبّع وتُفتح بطريق العنوان
المكتوب (`nav:go`)؛ وملفا المفضلة والروابط المثبّتة يُكتبان كاملين أو لا يُكتبان.
أول تشغيل بعد التثبيت على Windows (ملاحظات `run-checks`): نافذة Noor بعد 4.75
ثانية (الشريط بعد 2.98)، والتشغيلات الأخرى 1.8–3.2 ثانية. صدرت **1.0.45**.

**التشغيلان 7 و8: كل الحزم نجحت على Windows.** في التشغيل 7: `install`
و`install-iphone` نجحا بعد انتظار النافذة في التشغيل الأول؛ و`smoke-close`
بطرقه الثلاث (taskkill مرة لكل نافذة: Noor سليم بعد الأولى، ثم يخرج). في
التشغيل 8: `smoke-session-end` على Windows نفسه: رسالتا WM_QUERYENDSESSION
وWM_ENDSESSION إلى نوافذ Noor كما يرسلهما Windows، ثم إنهاء العملية وإعادة
التشغيل: الصفحتان عادتا كما كانتا، ومنهما الصفحة المفتوحة لحظة نهاية الجلسة
(أي أن Electron يطلق "session-end" على Windows وNoor يحفظ فيه). منه صدرت النسخة
**1.0.44** (الدمج في main: `9af1dd5`، سير عمل البناء رقم 44).

**التشغيل 6 (41359887145): الإغلاق محسوم.** `smoke-close` برقم Noor الحقيقي:
واحدة بعد الأخرى خرج Noor بعد 0.59 ثانية، والاثنتان معاً (WM_CLOSE للنافذتين
في اللحظة نفسها) بعد 0.69 ثانية، والأحداث بترتيبها ولا عملية تبقى. `taskkill`
بلا `/F`: "SUCCESS"، لكن نافذة واحدة (Personal) وصلها الطلب وأُغلقت، وبقيت
"Second - Noor" ومعها Noor: taskkill يسأل النافذة الرئيسية وحدها (كـ
`CloseMainWindow`). إذن لا خلل إغلاق في Noor على Windows؛ ما رُئي في التشغيلات
3–4 كان من طريقة الاختبار. صار الاختبار يرسل taskkill مرة لكل نافذة ويتحقق أن
Noor سليم بعد الأولى. وفشل التثبيت: الخطوة "first start: a window is on the
screen" سُئلت مرة واحدة فور جواب الشريط ({"handle":0})، في أول تشغيل لنسخة
مثبّتة للتو؛ صارت تُنتظر حتى 20 ثانية وتُسجَّل مدتها (`05ebf3c`).

**المشروعان الآخران (2026-11-01 ليلاً):**
- **Noor Android الأصلي** (`kamaltv1010-boop/androi.noor`، محلياً في
  `/home/user/androi.noor`): فحص الأسرار بـ secretlint 13.1.0 (اختبار الضبط 1):
  40 ملفاً و3 commits، رمز الخروج 0. وُجد في `.github/workflows/build.yml`: نسخة
  APK تُنشر من مهمة البناء ولو فشل اختبار المحاكي (لا `needs`)؛ وصف النسخ
  بالإنجليزية؛ وصلاحية `contents: write` لكل المهام، فمهمة المحاكي (وفيها إجراء
  خارجي) تصل إلى مفتاح التوقيع في النسخة المسودّة، وكلمة سره مكتوبة في الملف
  والمستودع عام. الإصلاح (`af7d1a2`، `9008118`، `8585621`): مهمة `release` بعد
  `android` و`emulator`؛ وصف عربي من `CHANGELOG.md` (جديد)؛ الكتابة لمهمتي البناء
  والنشر فقط. جُرّب على فرع بتشغيل يدوي (41360412069): البناء نجح بمفتاح التوقيع
  نفسه (SHA-256 يبدأ بـ `2E:CB:0A:D7`)، والمحاكي نجح (Android 15، API 35،
  google_apis، x86_64، WebView 124)، والنشر تُخطّي خارج main. دُمج في main بـ
  `[skip ci]` (لا نسخة جديدة: التطبيق لم يتغيّر). **يبقى بيد صاحب الحساب:** تغيير
  كلمة سر المفتاح (keytool، المفتاح نفسه يبقى) ونقله مع كلمة السر إلى GitHub
  Secrets. (الفرع التجريبي لم يُحذف من GitHub: وسيط الشبكة هنا يقطع حذف الفروع.)
- **Noor iPhone الأصلي** (Amir): آخر بناء IPA على macOS نجح (`3006614`،
  التشغيل 41344333061)؛ مفاتيح App Store Connect من الأسرار ولا تُطبع. لا نص
  "What to Test" عربي لـ TestFlight بعد: يحتاج تشغيل الرفع بحساب Apple، فلم
  يُشغَّل دون طلب.

**التشغيل 5 (41358672335):** ثبت على Windows: موضع نافذة الإضافة المنبثقة
(`smoke-extensions` نجح)، التنبيه الواحد لجمع الكوكيز (`smoke-warmup` نجح)،
اختبار الـ workers في النسخ الثلاث، و`built-app` للنسخ الثلاث: كل نافذة من
نافذتَي Noor (البروفايلان) اختفت بعد 50–65 ملّي ثانية من WM_CLOSE، ثم خرج Noor
وحده، في الإغلاقين. و`smoke-close`: الإغلاق واحدة بعد الأخرى، والاثنتان معاً
(WM_CLOSE لكل منهما في اللحظة نفسها) نجحا؛ فشل `taskkill` وحده، والسبب في
الاختبار: Playwright يبدأ Electron على Windows عبر `cmd.exe` (shell)، فرقم
العملية الذي يعطيه لعملية cmd.exe بلا نوافذ (taskkill: "لا تُنهى إلا قسراً").
صار الاختبار يأخذ الرقم من Noor نفسه (`d15442a`). فشل التثبيت في Noor وNoor
iPhone (لا Android) بقي سببه غير ظاهر في السجل؛ صار سطر PROBLEMS في آخره.
ملاحظة: في كل مهمة، أول تشغيل للتطبيق على الآلة هو الذي يفشل (install في مهمة
Noor، install-iphone في مهمة النسختين)، وinstall-android بعد عدة تشغيلات ينجح.

**ما ثبت على Windows:** الـ fuses في الـ exe الثلاثة؛ الكوكيز مشفّرة على القرص
(ومفتاحها محفوظ بـ DPAPI) حتى بعد تحديث؛ منع طرق الدخول إلى العملية (`ways-in`)؛
منفذ التصحيح يرفض الصفحات؛ شعار كل exe هو شعاره؛ صفحة الهاتف كاملة على شاشة
768 (التشغيل 3)؛ صيغة WebGPU عبر SwiftShader؛ التثبيت وإزالته (Noor Android
والكود)، والعزل، والثبات بعد إعادة التشغيل، وWebRTC، والذاكرة؛ والخطوط بعد
تثبيت Inter وJetBrains Mono (التشغيل 4).

**ما فشل في التشغيل 4، وسببه:**
- `workers` (كل النسخ): Chromium نفسه في الـ shared/service workers على Windows
  يعطي Arial لكل الخطوط العامة (والحماية مطفأة)؛ إصلاح الاختبار في `7f8a90f`
  (لم يكن مرفوعاً).
- `smoke-extensions`: النافذة المنبثقة للإضافة 8 بكسل يسار زرها و8 أسفل مكانها
  (المكتبة تحسب من حدود النافذة الخارجية، وعلى Windows فيها حافة غير مرئية).
  أُصلح في `9ceb473` (`main/extensions.js`، حدث `will-move`). على Linux بمحاكاة
  حدود Windows: قبل 497 و12.5 بكسل، بعد 505 و4.5 (كما بلا إطار).
- `smoke-warmup`: تنبيه بدء جمع الكوكيز انقسم ("Farm 1" وحده ثم "بروفايلين")
  لأن كل بروفايل يعدّ كوكيزه بسرعة مختلفة. أُصلح في `2522beb`؛ أُعيد الإنتاج على
  Linux بتأخير مصطنع (0 و0.7 و1.4 ثانية): قبل 3 تنبيهات، بعد تنبيه واحد.
- `built-app` (Noor): خطأ في الاختبار: قراءة `DevToolsActivePort` أثناء كتابته
  (`EBUSY`، Windows يقفل الملف). صارت تُعاد.
- `install` و`install-iphone`: تقرير المسبار لم يُقرأ (سطرا CLOSING وPROBLEMS بعد
  الـ JSON)، فلم يظهر سبب الفشل. صار يُقرأ، والخطوات الفاشلة تُذكر بأسمائها.
- **الإغلاق:** بيانات التشغيل 4 بيّنت أن `CloseMainWindow` يغلق نافذة واحدة
  (الأمامية، "Second - Noor") وتبقى نافذة البروفايل الأول، وهذا صحيح لتطبيق
  بنافذتين (Chrome كذلك). صار المسبار يغلق كل نافذة كما يفعل المستخدم (WM_CLOSE،
  واحدة بعد الأخرى). ويبقى سؤال التشغيل 3: مع `taskkill` (طلب إغلاق لكل النوافذ في
  اللحظة نفسها) بقيت نافذة؛ الاختبار الجديد `tools/smoke-close.js` يقيس ذلك على
  Windows (واحدة بعد الأخرى، الاثنتان معاً، taskkill) ويكتب كل حدث بوقته. على
  Linux: ينجح بالطريقتين (الخروج في أقل من 0.1 ثانية، لا عملية تبقى).

## 2026-11-02 — Windows من جديد، وتدقيق أمني لـ Noor للحاسوب

**اختبارات Windows على آخر كود (1.0.45، `b2c0180`)، التشغيل 41472390877** (Windows
Server 2025 Datacenter 10.0.26100، جلسة تفاعلية 1024×768، بلا بطاقة رسوميات):
Noor المبني والمثبَّت 9 من 9، iPhone وAndroid المبنيان 11 من 11، كود iPhone
وAndroid 21 من 21، كود Noor **21 من 22**: فشل `debug-port-dev` في جزئه "العام":
"the page reported nothing" (لا وصول إلى المنفذ: الجزء المحلي محجوب، والعناوين
الأخرى مغلقة). السبب الذي وُجد: تشغيل Noor مرة ثانية في ثوانيه الأولى يضيع
(معالج "second-instance" كان يُسجَّل في آخر البدء)؛ والاختبار يرسل عنوان صفحته
بتشغيل ثانٍ بعد 4 ثوانٍ، فعلى آلة أبطأ ضاع. أُعيد إنتاجه على Linux
(`tools/smoke-second-launch.js`: ضاع في 3 من 3)، وأُصلح (`51c166e`: يُحفظ ويُنفَّذ
حين تجهز النوافذ؛ بعده 3 من 3، وعلى نسخة Linux المبنية).

**التدقيق الأمني (المهمة #92)** — نموذج الثقة: كل أوامر `noor:*` (نحو 60:
الإعدادات، البروفايلات، `cookies:list`، `cookies:export`، `extensions:install`…)
تُقبل من إطار عنوانه `noor://app/` فقط. ما فُحص وما وُجد:
- **موقع يصل إلى صفحات Noor** (`tools/probe-app-pages.js`، تسع طرق): قبل الإصلاح
  وصل بست (انتقال، رابط، نافذة بنقرة حقيقية، Ctrl+نقر، الزر الأوسط، تحويل 302)،
  وجسر الأوامر يجيبه في الصفحة (27 إعداداً). لا طريق استغلال اليوم (صفحات التطبيق لا
  تنفّذ شيئاً من عنوانها: `#قسم` و`?private=1` فقط)، لكنه باب مفتوح. أُصلح (`b91ace8`:
  `mayOpenAppPage` في will-navigate وwill-redirect وopenWindow)؛ بعده: لا شيء من
  التسع (Linux). الإطار وfetch والنافذة بلا نقر كانت محجوبة من قبل.
- **فتح برامج الحاسوب عبر روابط بروتوكولات أخرى** (Follina و`ms-msdt:` مثالاً):
  `openExternal` مرفوضة في كل جلسة. `tools/probe-external-protocols.js` يثبت ذلك
  عملياً ببروتوكول خاص بالاختبار (HKCU على Windows، xdg-open خاص على Linux) وبفحص
  ضبط يسمح عمداً: على Linux الأربع لم تشغّله، والضبط شغّله.
- **XSS في صفحات Noor**: لا `innerHTML` إلا لأيقونات من قائمة ثابتة، ولا روابط من
  البيانات في `href`، ولا `eval`؛ النصوص بـ `textContent`. `tools/probe-app-xss.js`:
  موقع يضع HTML بكود في عنوانه وكوكيزه؛ في الصفحات الخمس (شريط الأدوات مرتين،
  المكتبة، الكوكيز، البداية) ظهر نصه نصاً وعمل كوده 0 مرة (Linux).
- **غير ذلك مما رُوجع:** `serveAppPage` محمية من الخروج من مجلد `renderer`؛
  الروابط المثبّتة http وhttps فقط؛ السجل يحفظ صفحات الويب فقط؛ قائمة الزر الأيمن
  قائمة النظام (نص فقط)؛ `shell.openExternal` لعنوان ثابت واحد (GitHub).
- **مهمة سير عمل Android الأصلي** (من قبل): كلمة سر مفتاح التوقيع مكتوبة في ملف عام؛
  تبقى بيد صاحب الحساب (GitHub Secrets).

## 2026-11-02 (مساءً) — نتائج Windows، والإطارات من الموقع نفسه، وخطوط نسختَي الهاتف

**Windows (Server 2025 Datacenter 10.0.26100):** التشغيل 41479798659 (`00d8bb1`، منع
خداع النقر بالإطار بثلاث طبقات) نجح بالحزم الأربع، ومعه `probe-app-pages` (التسع).
التشغيل 41480643349 (`fd7f3ed`، تصنيف الخطوط في الـ workers) نجح بالأربع.

**اختبار توافق جديد** `tools/probe-page-errors.js`: نحو ستين واجهة (canvas
وOffscreenCanvas وWebGL/WebGL2 والصوت وIntl والوقت وnavigator والـ client hints
والأذونات والتخزين والأجهزة والشاشة وmatchMedia والخطوط والمستطيلات والأصوات
وWebRTC وcrypto) في الصفحة وإطار منها وworker، بالحماية وبدونها، في سياق آمن
(`calls.localhost`). أول تشغيل كشف أن **الإطار من الموقع نفسه لا يُكمل** (يتعلّق
عند `canvas.toBlob`) والحماية مفعّلة فقط.

**السبب (تجارب على Linux):** إطار من الموقع نفسه يبدأ بنافذة فارغة (about:blank)
تحميها الصفحة الأم (المراقب أو الدوال المعترَضة)، ثم يحمّل صفحته فيُبقي Chromium
النافذة نفسها (خاصية وُضعت على النافذة الأولى ظهرت في الصفحة) ويعطيها مستنداً
جديداً فقط، ولا يشغّل الـ preload (لم تطلب صفحة الإطار إعداداتها)، وحتى سكربتات
CDP (`addInitScript`) لا تعمل هناك. كل ما صنعته الحماية لمستند بقي للمستند القديم:
- **تسريب خصوصية:** الخطوط الظلّية في قائمة خطوط المستند القديم، فالإطار رأى خطوط
  الحاسوب كلها (DejaVu وFreeSerif وInter وCaladea وIPAGothic) كأن الحماية معطّلة؛
  الصفحة وإطار موقع آخر أخفياها.
- **توافق:** نسخة الـ canvas في المستند القديم، فلا يجيب `toBlob` أبداً.
- كذلك مراقب الإطارات الجديدة ومستمع ملء الشاشة (iPhone).

**الإصلاح (`f205f35`، والمصدر في Amir `bfcf22d`):** `eachDocument`/`syncDocument`
في الحماية: ما يُصنع لمستند يُصنع للحالي ولكل مستند جديد في النافذة حين يُكتشف (أي
دالة محمية، لمس الصفحة الأم للإطار، دوال القياس في النوافذ التي بدأت فارغة،
pagereveal/pageshow/load). نسخة الـ canvas في مستند الـ canvas. **الاختبار**
`tools/probe-site-frames.js`: قبل الإصلاح 6 مشكلات، بعده لا شيء (Linux، الثلاث).
**حدّ باقٍ (موثّق):** صفحة إطار من الموقع نفسه تصل بسكربت مضمَّن إلى إطار داخلها
عبر `window[0]` قبل أي دالة محمية: ذلك الإطار الداخلي قد لا يُحمى (لا حدث يسبق أول
سكربت في المستند الجديد).

**تسريب في نسختَي iPhone وAndroid (المهمة #95):** تحجبان قوائم ثابتة (297 خطاً لـ
Windows وOffice وAdobe…)، فكل خط مثبّت خارجها ظهر للمواقع (Inter وJetBrains Mono
وCascadia…)، واحداً في كل البروفايلات. الإصلاح: النسختان تسألان عن خطوط الحاسوب
أيضاً، و`deviceHidden` يخفي كل خط ليس للجهاز ولا مشتركاً معه بالاسم. تحقق
`probe-site-frames`: قبل الإصلاح iPhone أظهر Inter وJetBrains Mono؛ بعده لا.

**Windows بعد الإصلاحات:** التشغيل 41489779627 (`cdf4dcc`): 3 حزم من 4؛ في كود Noor
28 من 29 (`probe-site-frames` و`probe-page-errors` و`probe-local-files` و`probe-isolation`
نجحت)، وفشل `smoke-quota` مرة: الـ service worker في "بروفايل في الذاكرة" أظهر
3355260403 بدل 32504545280. لم يتكرر: التشغيل 41492276958 (`29d97f0`) **75 من 75**
(المبني 10، الهاتف المبني 11، كود Noor 29، كود الهاتف 25)، و4 تشغيلات على Linux.
فرضية لم تثبت: worker يبدأ قبل أن يربط `registerTab` سياقه بجلسته
(`contextSessions`)؛ تأخير الربط 1.2 ث تجريبياً لم يُعِد إنتاجه، فلم يُدفع إصلاح
(التعديل محفوظ خارج المستودع للمتابعة). **اختبار جديد:** `probe-workers` يقارن هوية
كل سياق بصفحته (User-Agent، المنصة، اللغات، الأنوية، الذاكرة، المنطقة الزمنية) في
البروفايلين؛ متطابقة في الثلاث على Linux (`e67481c`). المنطقة الزمنية المفروضة
(طوكيو) تظهر في الصفحة والـ workers الثلاثة والنظام على UTC.

**ما فُحص ولم يُكتشف فيه خلل:** `queryLocalFonts` (Noor: صفر خطوط بنقرة حقيقية؛
iPhone وAndroid: غير موجود)؛ `npm audit --omit=dev`: صفر؛ Electron 45.2.1 أحدث
إصدار؛ أدوات البناء: 15 متوسطة في minimatch (لا تُشحن)؛ الأذونات قائمة ثابتة واحدة
بلا موافقات محفوظة (لا عزل يُكسر).

**التشغيل 41494327969 (`e67481c`، اختبار هوية الـ workers):** المحاولة الأولى لحزمة
كود Noor فشلت باختبارين غير مرتبطين وبعلامات بطء الآلة: `smoke-warmup` (انتظار
ثابت ثانيتين لصفحة الكوكيز ثم قراءة عنصر غير موجود بعد) و`probe-workers` (التشغيلان
المحميان لم يرسلا تقريراً في 60 ث؛ 193 ث بدل 28). إعادة الحزمة وحدها على الـ commit
نفسه: **نجحت**، فالحزم الأربع ناجحة. انتظار `smoke-warmup` صار مرناً (حتى تظهر قائمة
المواقع، 15 ث على الأكثر) على الفرع التالي.

**النسخة 1.0.46 صدرت** من `29d97f0` (البناء 46، 2026-11-02 18:27 UTC) بعد نجاح
**75 من 75** على Windows في التشغيل 41492276958 على الـ commit نفسه (`e67481c` يختلف عنه
بملف اختبار واحد فقط). وصفها بالعربية من قسم Unreleased، وستة ملفات: مثبّت ونسخة
محمولة لكل من Noor وNoor iPhone وNoor Android.

**بعد النسخة:** اختبارات Windows على `main` (`29d97f0`، التشغيل 41499112198): **75 من 75**،
تأكيد ثانٍ للنسخة 1.0.46. الفرع `windows-checks-18` (`996b993`: هوية الـ workers،
وانتظار `smoke-warmup` المرن؛ اختبارات فقط)، التشغيل 41501080201: **75 من 75**؛ دُمج
في `main` بلا نسخة جديدة (كود التطبيق نفسه).

## 2026-11-02 (ليلاً) — الشبكة المحلية، علامة الإنترنت، VideoFrame، IPC، WebGL

**أمان: الشبكة المحلية (`ab1557d`).** كان فحص Noor لطلبات الموقع نحو هذا الحاسوب أو
شبكته ينظر إلى العنوان المكتوب في الرابط فقط (127.0.0.1، 192.168.…)، فاسم يُحلّ إلى
عنوان محلي (موجود فعلاً، مثل 127.0.0.1.nip.io) يمرّ، وكذلك إعادة ربط اسم الموقع بعد
تحميل صفحته (DNS rebinding). حماية Chromium نفسها (Local Network Access) لا تعمل في
Electron حتى مع تفعيل خصائصها (جُرّب). الإصلاح: `leadsHome` يحلّ الاسم بـ
`session.resolveHost` (محلّل Chromium وذاكرته) ويمنع الطلب إن أدّى إلى عنوان محلي؛
ومكان كل صفحة (`originPlaces`) من العنوان الذي جاء منه ردّها فعلاً (`details.ip`)،
مع احترام `treat-as-public-address`. أول تصميم أعاد حلّ اسم الصفحة نفسه، فبقي هجوم
إعادة الربط الكلاسيكي ممكناً: استُبدل. الاختبار `tools/probe-local-network.js`: صفحة
موقع (CSP `treat-as-public-address`) تجرّب تسع طرق، وصفحة من هذا الحاسوب ضابطة (يجب
أن تصل 4 مرات على الأقل). **Windows:** التشغيل 41508431811 (`9a0c809`) نجح.

**علامة الإنترنت (تصحيح لما ظُنّ ثغرة).** `9a0c809` أضاف `main/downloads.js` ليكتب
`Zone.Identifier` إن غاب، على ظنّ (من Linux، حيث لا تدفق) أن Electron لا يكتبه. سطور
`note` في التشغيل 41512893358 على Windows أظهرت أن Chromium في Electron **يكتبه بنفسه**:
ZoneId=3 مع ReferrerUrl وHostUrl، و`HostUrl=about:internet` من التبويب الخاص. فأُزيل
الكود (لا فائدة منه، وكان سيتجاوز سياسة Windows «لا تحفظ معلومات المنطقة» إن فعّلها
المسؤول)، وبقي `tools/probe-downloads.js` حارساً (تنزيلان: عادي وخاص).

**خصوصية: VideoFrame (`8f87b70`، المصدر في Amir `2e909d6`).** `new VideoFrame(canvas)`
ثم `copyTo` قرأ الرسم الحقيقي متجاوزاً الحماية (من canvas وOffscreenCanvas وصورة
نقطية). الآن يُصنع من النسخة المشوّشة (`Reflect.construct`، والواجهة كواجهة المتصفح:
toString والاسم والطول والـ prototype والخطأ بلا new). الاختبار
`tools/probe-canvas-reads.js` (13 طريقة في الصفحة واثنتان في الـ worker، الحماية
مفعّلة وموقوفة). بناء Amir على macOS نجح (41510416573)؛ لم يُختبر على جهاز.

**ترويسات الطلبات (`d630045`).** `tools/probe-request-headers.js`: الصفحة والصورة
والسكربت وfetch والإطار والـ workers الثلاثة بعد `Accept-CH`. نسختا الهاتف لا تذكران
Windows في أي طلب؛ Noor iPhone لا يرسل Client Hints؛ Android يرسل المنصة Android.
فرق معروف عن Chrome (حدّ موثّق): طلبات الـ workers بلا Client Hints منخفضة الدقة.

**أمان: IPC والدوال الأساسية (`f94eff3`).** الصفحات تعمل و`contextIsolation` موقوف
(لتصل الحماية إلى دوال الصفحة). في Electron القديم كانت صفحة تستبدل
`Array.prototype.push` تلتقط `ipcRenderer` حين تصل إطارها رسالة (emit في عالم الصفحة).
في Electron 45.2.1 صار `ipcRenderer` كائناً أصلياً (`lib/renderer/api/ipc-renderer.ts`)،
والقنوات الداخلية في المتصفح قليلة (`BROWSER_GET_PROCESS_MEMORY_INFO`،
`BROWSER_PRELOAD_ERROR`، `GUEST_VIEW_*` و`<webview>` ممنوع)؛ لا `SANDBOX_LOAD` التي
كانت تعيد `process.env`. تجربة: 209 دوال مغلّفة ورسائل `send` و`frame.send`: لا شيء
التُقط. وقنوات `noor:*` كلها تتحقق من المرسل (`trusted`). الاختبار
`tools/probe-page-globals.js`: عشرة سياقات (الصفحة، إطار بعنوان، srcdoc، فارغ، موقع
آخر، نافذة مفتوحة، نافذة فارغة كتبت فيها الصفحة، worker مخصّص ومشترك وخدمي) وصفحة
الدوال المستبدلة، مع فحصين ضابطين. **Windows:** نسختا الهاتف نجحتا (التشغيل
41512893358).

**WebGL (`f4cab86`).** `tools/probe-webgl-reads.js`: تدرّج من shader بـ WebGL وWebGL2،
12 طريقة قراءة محمية (readPixels للكل ولجزء ولإطار خاص، toDataURL، toBlob، 2D، صورة
نقطية، VideoFrame، WebGL آخر، وworker: readPixels وconvertToBlob): لا واحدة تعطي
الرسم الحقيقي (Linux، الثلاث). **حدّ معروف، عن قصد:** `PIXEL_PACK_BUFFER` مع
`getBufferSubData`، وإطار أعداد عشرية يُقرأ FLOAT، يعطيان الرسم الحقيقي؛ بهما تقرأ
مواقع الحساب على بطاقة الرسوميات (TensorFlow.js…) نتائجها، والتشويش يفسدها.

**أمان (تحصين، `77ecd80`): صفحات file://.** الـ fuse `GrantFileProtocolExtraPrivileges`
كان على قيمته الافتراضية (مفعّل): صفحة file:// في تبويب قرأت ملفاً سرياً آخر بـ fetch
وXHR وإطار (Linux). لا طريق معروف يفتحها في Noor (شريط العنوان يبحث عن file:، والتشغيل
http(s) فقط، و`navigateOnDragDrop` موقوف افتراضياً في Electron). أُطفئ في
`build.electronFuses`؛ `check-fuses` يتحقق منه؛ `probe-built-app` يأخذ تبويباً إلى صفحة
file:// عبر بروتوكول التصحيح: نجح بـ Electron مقلوب الـ fuse وفشل بالعادي (Linux،
بغلاف حول Electron). صفحات noor:// تعمل (تُقرأ في البرنامج الرئيسي بـ `net.fetch`).

**فُحص ولم يُكتشف فيه خلل:** الأذونات (قائمة ثابتة، لا موافقات محفوظة)؛ جسر الإضافات
المحلي (مسار سري 128 بت، ومفتاح جلسة، ومصدر إضافة مثبّتة)؛ إصدار Windows في Client
Hints حقيقي كما في Chrome (`useragent.js`، اختيار مقصود).

**Windows:** التشغيل 41512893358 (`f94eff3`): كود الهاتف 31/31، الهاتف المبني 11/11؛ كود Noor
33/34 (`probe-workers`: آلة بطيئة جداً، `probe-webgpu` 111 ث بدل 5، وتشغيل «الحماية مطفأة» لم
يُرسل تقريره فاحتُسب فرق Arial الذي هو سلوك Chromium في الـ workers المشتركة على Windows)،
والمبني 9/10 (`second-launch` تجاوز الوقت صامتاً: صار له مهلة وسطور `note`، `68d2f51`).
التشغيل 41514040019 (`f4cab86`): **89 من 89** (كود Noor 35، المبني 10، الهاتف المبني 11، كود
الهاتف 33)، ومنه `probe-webgl-reads` وملاحظتا الحدّين. التشغيل 41515665618 (`43d1dd8`، الـ fuse
مطفأ): المبني 10/10 (`check-fuses` و`probe-built-app` بخطوة file://).

التشغيل 41516628876 (`68d2f51`): 3/4؛ `probe-site-frames` فشل بخلل في الاختبار: Inter
وJetBrains Mono في مجموعة الخطوط التي يختار منها بروفايل Windows (`rules/font-pool.json`،
نحو 5.4% و5.9%)، والبروفايل العشوائي اختار Inter. الإصلاح (`b16b514`): بذرة الخطوط 1 (لا
تختار أياً منهما) ويُقرأ من التطبيق أنها أُخذت؛ و`probe-workers` يكتب مراحل الـ service worker
ومهلته 20 ث. التشغيل 41519316199 (`b16b514`): **89 من 89** (كود Noor 35، كود الهاتف 33،
المبني 10، الهاتف المبني 11 بعد إعادة واحدة: `install-iphone` فحص قبل أن ينهي مُزيل NSIS حذف
الاختصارات والسجل؛ `7b35f42` ينتظره). **النسخة 1.0.47 صدرت من `b16b514`** (البناء 47،
2026-11-02 21:04 UTC، ستة ملفات، الوصف العربي من Unreleased). تأكيد على `main` (التشغيل
41523454284): 88/89، `probe-isolation-android` انهار بانتظار ثابت (ثانيتان) قبل أن تُحمَّل
الصفحة؛ `a6395e3` ينتظر جاهزيتها. التشغيل 41521783891 (`7b35f42`): 87/89 (العزل نفسه في
iPhone وAndroid). التشغيل 41525251662 (`a6395e3`): 88/89، `probe-device-android`: البروفايل
الأول بلا `navigator.getBattery` مرة. **حُقِّق فيه: خلل في الاختبار**: غابت معها أجهزة الوسائط
ولوحة المفاتيح، وكلها لا تكون إلا في سياق آمن، أي أن الاختبار قرأ مستند التبويب الفارغ قبل
وصول الصفحة (انتظار ثابت ثانيتين). `5d3b213` ينتظر الصفحة نفسها ويكتب عنوانها. التشغيل
41536905205 (رقم 27، `5d3b213`): نجح فيه `probe-device-android`، وفشل اختباران آخران لم يفشلا
قبل: `ways-in` (EBUSY عند حذف المجلد المؤقت: عملية مساعدة لـ Noor تبقي ملفاً مفتوحاً لحظة
بعد خروجه) و`cookie-store-update` (وصل طلب الصفحة ولم يصل طلبها الثاني في 60 ث). `9a9ae74`:
الحذف يُعاد 5 ث ولا يُفشل الاختبار (وفي `probe-debug-port` و`probe-local-files`)، واختبار
الكوكيز يكتب متى وصل كل طلب. التشغيل 41543485901 (رقم 35، `9a9ae74`): **89 من 89** (كود
Noor 34 ومشكلة معروفة واحدة كما هي، كود الهاتف 33، المبني 10، الهاتف المبني 11).

**iOS (Amir):** النسخة **4301 على TestFlight** (التشغيل 41518448531، كود `2e909d6`): عالجها
Apple وكُتب وصفها العربي في What to Test (`testflight.yml` يقرؤه من `CHANGELOG.md` الجديد،
ويرفض الرفع بلا وصف). **Android (androi.noor):** `protect.js` مُعاد توليده من ملف Swift
الحالي؛ البناء 5 فشل في المحاكي بـ Broken pipe من خادم الاختبار (أُصلح)؛ **v1.0.6 منشورة**
(البناء 6: الوحدة، APK موقّع، المحاكي API 35 بـ WebView 124).

**طلب لم يُنفَّذ (حدّ):** صاحب المشروع ذكر أن Instagram يعرض صفحة «أنت روبوت» في Noor
Windows. هذا نظام Instagram لكشف الآلية والاحتيال: لا عمل على تجاوزه (كما قيل له)؛ عُرض
عليه ما يدخل في الحدود (أعطال توافق، تسريب معلومات حقيقية).

**مفتوح ويحتاج قراراً:** منفذ التصحيح (P1-8) يصل إليه أي برنامج على الحاسوب، ومنه
حسابات Windows الأخرى على الحاسوب نفسه (المنفذ على 127.0.0.1 مشترك بين المستخدمين)؛
الحل المؤجَّل مُشغِّل بالـ pipe. أصوات القراءة (`speechSynthesis`) في نسخة Windows هي
أصوات الحاسوب الحقيقية، واحدة في كل البروفايلات (كما في Chrome).

## Resume point

**نقطة الاستئناف:** النسخة **1.0.49** صدرت (2026-11-07 12:41 UTC، البناء 49، `941d00b`). فيها أمران:
نسخ كوكيز الصفحة كسطر `Cookie` بـ Ctrl+O ولصقها في الصفحة؛ وكوكيز يبدأ بها كل بروفايل جديد
(الإعدادات ← Cookies ← «Cookies of every new profile»). تقبل البطاقة سطر Ctrl+O مع موقعه، أو
cookies.txt، أو JSON. توضع الكوكيز قبل جمع الكوكيز في New Profile وCreate multiple profiles
والبروفايل البديل عند الإغلاق، وإن كان البرنامج يُغلق ففي التشغيل التالي. القيم تُحفظ مشفّرة
(safeStorage، أي DPAPI) في `new-profile-cookies.json`، وكود ذلك في `main/new-cookies.js`. على
Windows قبلها، التشغيل 42371157907 (41): مصدر Noor 37/37، ومنها `smoke-new-profile-cookies`
الجديد الذي تحقق فيه التشفير؛ وبناء الهاتف 11/11؛ ومصدر الهاتف ناجح. أما Noor المبني فكان
9/10 ثم صار 10/10 بعد إعادة المهمة مرة واحدة: في `second-launch` ضاع مرة عنوان تشغيل ثانٍ أثناء
البدء (خرج 0 عند 2.9 ث ولم يُطلب العنوان)، ثم فُتح على الـ commit نفسه. هذا خلل متقطع للمتابعة؛
الأرجح أن تسليم سطر الأوامر عبر ProcessSingleton يفشل والنسخة الأولى منشغلة بالبدء. ما قبلها:
النسخة **1.0.48** صدرت (2026-11-03 00:17 UTC، البناء 48، `02dc5d9`): نافذة البروفايل في Noor iPhone وNoor Android تُفتح على الشاشة كلها كما في Noor (طلب صاحب المشروع، واختار «تكبير النافذة فقط»: صفحة الجهاز بحجمها الحقيقي في الوسط، والنافذة عند تصغيرها بحجم الجهاز). على Windows قبلها: التشغيل 41548774593 (36) **90 من 90** (89 ناجحة ومشكلة معروفة واحدة؛ ومنها `smoke-windows-android` الجديد). ما قبلها: النسخة 1.0.47 صدرت (الشبكة المحلية وإعادة ربط DNS، VideoFrame، تحصين
file://، والاختبارات الجديدة: متغيرات الصفحة وIPC، ترويسات الطلبات، قراءات canvas وWebGL).
iOS 4301 على TestFlight، وAndroid 1.0.6 منشورة. بعدها إصلاحات اختبارات فقط (`5d3b213`
البطارية، `9a9ae74` حذف المجلد والتوقيت)، 89/89 في التشغيل 35، على `main` بلا نسخة جديدة.
للمتابعة: `probe-workers` (service worker لم يُجب مرتين؛ يكتب مراحله الآن، ولم يتكرر في
التشغيلات 24 إلى 35)، و`cookie-store-update` إن تكرر (يكتب التوقيت)؛ والقراران المفتوحان (منفذ
التصحيح: مُشغِّل بالـ pipe؛ أصوات القراءة الحقيقية في نسخة Windows)؛ والحدّان المعروفان في
WebGL (PIXEL_PACK_BUFFER والإطار العشري). ما قبلها: النسخة 1.0.46 صدرت (الإطارات من الموقع نفسه، وخطوط نسختَي
الهاتف، وخداع النقر، والاختبارات الجديدة). على فرع العمل بعد `main`: `e67481c` (هوية
الـ workers، نجح على Windows) وانتظار `smoke-warmup` المرن، يُختبران على Windows ثم
يدخلان النسخة التالية. للمتابعة: فشل `smoke-quota` الواحد في التشغيل 15 (فرضية سباق
`contextSessions`، التعديل محفوظ خارج المستودع)، والحدّ الباقي في إصلاح الإطارات
(`window[0]` قبل أي دالة محمية). التالي أيضاً:
1. الروابط المثبّتة موجودة الآن في الثلاثة: تطبيق iPhone ("Pin Link")، وNoor
   Android الأصلي (`StartPage.kt`، تبويب "Pinned")، وNoor للحاسوب (1.0.45). يبقى
   قياس طريقة فتحها على الهاتف (محاكي Android، iOS على macOS) كما قيست هنا.
2. Noor iPhone الأصلي (Amir): إصلاح ClientRects (`3006614`) مبني على macOS ولم
   يُرفع إلى TestFlight؛ يُرفع إن طلب صاحب المشروع (حسابه في Apple)، مع نص "What
   to Test" بالعربية.
3. Noor Android الأصلي: أول نسخة فيها تغيير في التطبيق تمر بالبوابة الجديدة
   (لا نشر قبل نجاح المحاكي، وصف عربي). نقل مفتاح التوقيع وكلمة سر جديدة إلى
   GitHub Secrets بيد صاحب الحساب.
بعدها: ميزات WebGPU وحدوده في Noor Android وNoor iPhone؛ مراقب المنطقة الزمنية؛
مُشغِّل يبدأ Noor بالـ pipe بدل منفذ التصحيح (P1-8، انظر PLAN.md).
