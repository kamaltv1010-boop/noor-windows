# Noor لـ Windows 🛡️

متصفح خاص لـ Windows، بنفس الفكرة ديال [تطبيق Noor ديال iPhone](https://github.com/kamaltv1010-boop/Amir): **بروفايلات** كل واحد ببصماته والبيانات ديالو، **حماية ضد البصمات** (Canvas، WebGL، الصوت، ClientRects، الشاشة، البروسيسور)، **حجب المتتبعين**، **HTTPS**، **روابط نقية**، و**جلسة جديدة** بضغطة. مبني بـ Electron (Chromium)، وكيتبنى `.exe` أوتوماتيكياً فـ GitHub Actions.

وكاينة حتى **[Noor iPhone](#noor-iphone-)**: نفس المتصفح على Windows، ولكن المواقع كتشوف فيه iPhone حقيقي فيه Safari.

## التحميل ⬇️

- **Releases** (https://github.com/kamaltv1010-boop/noor-windows/releases): كل build كيولي Release بوحدو، فيه `Noor-<version>-windows-x64-portable.exe` (portable، بلا تنصيب) و`Noor-Setup-<version>-windows-x64.exe` (installer). كل النسخ القديمة كتبقى هناك، وتقدر ترجع لأي وحدة فيهم.
- **Noor iPhone**: فنفس الـ Release، `Noor-iPhone-<version>-windows-x64-portable.exe` (portable) و`Noor-iPhone-Setup-<version>-windows-x64.exe` (installer).
- **Actions**: نفس الملفات كاينين حتى فـ artifact ديال كل run (90 يوم، وخاصك تكون مسجّل فـ GitHub).

الـ `.exe` ماشي موقّع (code signing)، فـ Windows SmartScreen غادي يسوّل أول مرة: **More info** ← **Run anyway**.

**الإصدار**: كل build عندو رقم بوحدو، `1.0.<رقم الـ run>` (مثلاً `1.0.4` = run 4)، والـ Release كياخد رقم الـ tag ديالو. كيبان فآخر القائمة ⋯، فـ الإعدادات ← About، وفسمية الملف.

## شنو فيه ✨

- **الملفات الشخصية (Profiles) 👤**: زر «👤 Personal ▾» فالشريط وفصفحة البداية، وقسم فالإعدادات. كل بروفايل عندو الـ cookies والبيانات ديال المواقع ديالو (partition ديال Chromium بوحدو)، السجل ديالو، الـ onglets ديالو، والبصمات ديالو. **ملف شخصي جديد** كيصاوب واحد ويحلو، **Delete** كتمسحو مع كل البيانات ديالو، و**Delete All** كتمسح كلشي ما عدا الأول بضغطة وحدة. المفضلة والإعدادات مشتركين.
- **المنطقة الزمنية ديال الـ IP 🕒**: الصفحات كتشوف المنطقة الزمنية ديال البلاصة فين كاين الاتصال ديالك (ديال الـ VPN إلا كان مشعل)، بحال زائر حقيقي من تماك، بلا ما تبدل شي حاجة فWindows. كتتعاود كل 15 دقيقة، وتقدر تطفيها من الإعدادات.
- **الحماية ضد البصمات 🎨**: الصفحات كتشوف Canvas وWebGL وصوت فيهم ضجيج صغير (نفس الطريقة والكود ديال نسخة iPhone: `scripts/protect.js` كيتولّد من `FingerprintProtection.swift`)، قياسات ClientRects مزحزحة شوية (الصوت وClientRects طافيين فالبداية: فالـ PC هاد القيم تقريباً نفسها عند الجميع، فالضجيج فيهم كيبيّن المتصفح بدل ما يخبيه)، وشاشة وعدد cores ديال PC عادي آخر (دائماً أكبر أو يساوي الشاشة الحقيقية). الحماية كتوصل حتى للـ Web Workers (وحتى worker داخل worker)، للـ Shared Workers وللـ Service Workers، وللـ frames والنوافذ اللي كتحل الصفحة، باش الصفحة ما تلقاش فرق بيناتهم. حجم الشاشة كيوريه Chromium نفسو للصفحة، فالـ CSS (`@media (device-width)`) والـ JavaScript متوافقين. القيم كتبقى ثابتة فنفس الموقع فنفس البروفايل، وكتتبدل من موقع لآخر. **New** حدا كل حماية كيعطي قيم جديدة، و**Change All** كيبدّل الكل.
- **Google Chrome 🪟**: المواقع كتشوف Chrome على Windows بنفس الإصدار ديال Chromium اللي فالتطبيق، بلا أثر ديال Electron: الـ user agent، الـ brands ديال `navigator.userAgentData` وديال headers `Sec-CH-UA` (مع Google Chrome)، `chrome.app/csi/loadTimes` (بنفس الشكل والقيم ديال Chrome)، `navigator.webdriver = false`، الأذونات بحال Chrome جديد (اللي Chrome كيعطيه بلا سؤال كيتعطى، والباقي كيبان «prompt»)، الأصوات ديال Google فـ `speechSynthesis`، وWidevine (الطلبات ديالو كتجاوب بحال Chrome بالضبط، بـ ClearKey حقيقي من التحت؛ الأفلام المحمية مازال ما كتخدمش).
- **الإضافات (Extensions) 🧩**: إضافات Chrome كتخدم فـ Noor بحال نسخة iPhone. حل صفحة ديال إضافة فـ **Chrome Web Store** وضغط **«🧩 Add to Noor»** فالشريط: Noor كيجيبها من نفس البلاصة اللي كيجيبها منها Chrome، كيتأكد من التوقيع ديالها، كيوريك شنو تقدر دير، وكيزيدها. تقدر تزيد حتى من ملف `.crx` ولا `.zip` ولا folder فيه `manifest.json` (الإعدادات › Extensions). الأزرار ديالها كيبانو فالشريط (مع الـ popup ديالها)، والـ items ديالها فقائمة الكليك اليمين. إضافات الـ store كيتجددو بوحدهم بحال Chrome. فالإعدادات تقدر تطفي ولا تمسح كل وحدة، ولا تحل الـ Options ديالها. الـ background (service worker) ديال كل إضافة عندو نفس الـ API اللي عند الصفحات ديالها (الـ onglets، النوافذ، الـ cookies، القوائم…)، باش إضافة بحال «Get cookies.txt» تلقى الصفحة اللي حالّة حتى والـ popup ديالها محلول. كيخدمو فالـ onglets العاديين ديال كل البروفايلات؛ الـ onglets الخاصة بلا إضافات (بحال Incognito ديال Chrome)، وحتى ملي يكون «مسح كل شيء عند الخروج» مشعل، حيت Chromium ما كيقدرش يخدّم إضافات فين ما كيتحفظ والو.
- **الدروع (Shields) 🛡️**: حجب الملفات ديال المتتبعين من طرف ثالث (Meta، Google Analytics، TikTok…، نفس القائمة ديال iPhone فـ `rules/trackers.json`)، فتح `http://` على `https://` (والرجوع لـ `http://` إلا الموقع ما كيدعمش)، وحذف `fbclid`/`gclid`/`utm_*` من الروابط. الزر 🛡 فشريط العنوان كيبيّن شحال من متتبع تحجب، وكيخليك تطفي الدروع لموقع واحد.
- **مواقع تسجيل الدخول**: Meta (Instagram، Facebook…)، Google، Apple وMicrosoft كيشوفو الشاشة والـ hardware الحقيقيين (مع الضجيج ديال Canvas/WebGL/الصوت)، بحال نسخة iPhone.
- **جلسة جديدة 🔥**: كتمسح الـ cookies والبيانات والسجل ديال البروفايل المحلول، كتسد الـ onglets ديالو، وكتعطيه بصمات جديدة. **مسح كل شيء عند الخروج** فالإعدادات: البيانات كتبقى غير فالذاكرة، وكل تشغيل كيبدا بجلسة جديدة.
- **Onglets خاصة 🕶️**: `Ctrl+Shift+N`. ما كيتسجلوش فالسجل، والبيانات ديالهم كتمشي ملي تسد آخر onglet خاص.
- **المفضلة والسجل 📚**: ☆ فالشريط، صفحة البداية كتبيّن المفضلة، و`Ctrl+H` كيحل المكتبة.
- **الوضع الليلي 🌙**، **Zoom**، **بحث فالصفحة** `Ctrl+F`، **Developer Tools** `F12`.
- **الأذونات**: الكاميرا، الميكرو، الموقع والإشعارات مرفوضين تلقائياً.

## Noor iPhone 📱

نسخة ثانية من نفس المتصفح، كتخدم على Windows، ولكن **كل بروفايل كيبان للمواقع بحال iPhone حقيقي فيه Safari**، بحال تطبيق Noor ديال iPhone.

- **iPhone حقيقي لكل بروفايل**: واحد من 20 iPhone (من iPhone SE حتى iPhone 16 Pro Max، ومن iOS 16 حتى iOS 26)، بالـ user agent ديال Safari ديالو، الشاشة ديالو، الدقة ديالو (2x ولا 3x)، واللمس (`ontouchstart`، `maxTouchPoints = 5`، `pointer: coarse`). الصفحة كتبان فوسط النافذة بعرض الـ iPhone، والماوس كيخدم بحال الصبع (tap وscroll).
- **بحال Safari**: الطلبات كتمشي بالـ headers ديال Safari (بلا `Sec-CH-UA`، بالترتيب ديالو، وبلغة وحدة). الحوايج اللي كاينين غير فـ Chrome محيدين (`window.chrome`، `userAgentData`، `Notification`…)، والحوايج ديال Safari زايدين (`ApplePaySession`، `GestureEvent`، `webkitEnterFullscreen`…). WebGL ديال «Apple GPU»، الأصوات ديال iOS، الخطوط ديال iPhone (والخطوط ديال Windows مخبيين)، الأذونات بحال Safari، والوقت بالـ millisecond. كلشي هادا حتى فالـ frames، فالـ workers، وفالنوافذ اللي كتحل الصفحة، وفكل المواقع (حتى مواقع تسجيل الدخول).
- **الحماية**: Canvas، WebGL، الصوت وClientRects مشعلين من الأول (بحال تطبيق iPhone). **New iPhone** فالإعدادات (ولا فالقائمة ⋯ ← Fingerprint) كيعطيك iPhone آخر، و**جلسة جديدة** حتى هي كتبدّل الـ iPhone مع البصمات.
- **بوحدو**: عندو البروفايلات والبيانات ديالو (مجلد `Noor iPhone`)، ما كيختلطوش مع Noor. تقدر تنصّب جوج بجوج.

**الحدود** ⚠️:

- المحرك من الداخل باقي Chromium، ماشي WebKit ديال Safari. أغلب المواقع ما كتفرقش، ولكن الفحص العميق (بحال البصمة ديال الاتصال TLS/HTTP2، ولا تفاصيل دقيقة ديال JavaScript وCSS) يقدر يعرف بلي ماشي Safari حقيقي.
- باش الـ frames ديال مواقع أخرى ياخدو حتى هوما الشاشة واللمس ديال الـ iPhone، Noor iPhone كيطفي «Site Isolation» ديال Chromium: المواقع فيه أقل معزولة على بعضياتها من Noor العادي.

## كيفاش خدام ⚙️

- **Electron + Chromium**: نافذة وحدة (`BaseWindow`) فيها شريط (`renderer/chrome.html`) وonglet لكل صفحة (`WebContentsView`).
- **الحماية**: `scripts/preload.js` كيخدم فكل frame قبل أي script ديال الصفحة (sandboxed، فنفس العالم ديال الصفحة). كيسوّل الـ main process على الإعدادات ديال الصفحة (`noor:page-config`): البذور (seeds) ديال البروفايل، الشاشة، الـ hardware، والـ brands، وكيطبّق `protectPage(window, config)`. الحماية كتتصاوب داخل frame خاوي ومخبّي (كيتحيّد قبل أول script ديال الصفحة)، باش الـ functions ديالها ما يبانوش فالـ stack ديال الأخطاء اللي كتقرا الصفحة (بحال الـ functions الأصلية ديال المتصفح)، وما يبانش المسار ديال الملف اللي فيه سمية المستخدم. فالـ Web Workers كتدخل ككود داخلي ديال DevTools، اللي حتى هو ما كيبانش؛ والـ Shared Workers والـ Service Workers كيتشدّو قبل أول سطر ديالهم من الـ target ديال Chromium نفسو (`main/browser-debugger.js`، بـ debugging port عشوائي على هاد الـ PC بوحدو). العلامات اللي كتعرف بيها الحماية الـ functions ديالها والـ frame المخبّي كيتبدلو مع كل تشغيل، فحتى صفحة ما تقدر تعرفهم ولا تقلّدهم. الصفحات ديال التطبيق نفسو (`noor://app/…`) كياخدو `window.noor` باش يهضرو مع الـ main process.
- **البروفايلات**: كل بروفايل عندو partition `persist:noor-<id>` (ملف `settings.json` كيحفظ القائمة، البذور، والـ onglets المفتوحة بمفاتيح `profile.<id>.…`)، وملف سجل بوحدو. الحذف كيمسح البيانات بـ `clearStorageData` وكيحيّد المجلد ديال الـ partition فالتشغيل الجاي.
- **الدروع**: `session.webRequest.onBeforeRequest` كيحجب الملفات ديال المتتبعين، و`onBeforeSendHeaders` كيصلّح `Sec-CH-UA`. الـ HTTPS والروابط النقية كيتطبقو قبل كل تنقل.

## الفرق مع تطبيق iPhone 📱

- ما كاينش «وضع iPad» ولا user agent عشوائي: على PC، المواقع كتشوف Chrome على Windows (أحسن تمويه هو اللي كيشبه أغلب الناس)، ولا iPhone فـ Noor iPhone.
- زادت حماية **Processor & Memory** (`hardwareConcurrency`/`deviceMemory`)، اللي Safari ما كيعطيهاش على iPhone.
- الإضافات كاينين (من Chrome Web Store ولا من ملف)، ولكن ما كيخدموش فالـ onglets الخاصة. بلا استيراد cookies فهاد النسخة.

## الملفات 📁

| الملف | شنو كيدير |
|---|---|
| `main/main.js` | التشغيل: الـ sessions، الـ protocol `noor://`، حجب المتتبعين، الـ headers، الـ IPC |
| `main/tabs.js` | النافذة، الـ onglets، البروفايلات، الجلسة الجديدة، حالة الشريط |
| `main/fingerprint.js` | أنواع الحماية، البذور لكل بروفايل، الشاشات والـ hardware |
| `main/shields.js` | الدروع لكل موقع، قواعد المتتبعين، HTTPS، الروابط النقية، الإحصائيات |
| `main/useragent.js` | الـ user agent ديال Chrome والـ brands |
| `main/profiles.js`, `main/history.js`, `main/bookmarks.js`, `main/store.js` | البروفايلات، السجل، المفضلة، الإعدادات |
| `main/menus.js`, `main/address.js` | القوائم والاختصارات، وشنو كيتحل ملي تكتب فشريط العنوان |
| `scripts/preload.js`, `scripts/protect.js` | الحماية المحقونة فالصفحات (مولّدين من `FingerprintProtection.swift` ديال iPhone بـ `tools/extract_from_ios.py`) |
| `scripts/parts/chrome.js` | الجزء الخاص بـ Chromium: `userAgentData` و`chrome.app/csi/loadTimes` |
| `main/iphone.js` | Noor iPhone: الـ iPhones، الـ user agent والـ headers ديال Safari، الشاشة اللي كيوريها Chromium |
| `scripts/parts/iphone.js`, `scripts/parts/iphone-surface.js`, `scripts/parts/iphone-fonts.js` | شنو كتشوف الصفحة فـ Noor iPhone: اللي عند Safari واللي ماعندوش، الخطوط |
| `main/extensions.js`, `main/extension-bridge.js` | الإضافات، والقنطرة اللي كتعطي الـ background ديالها الـ API (Electron ما كيخدّمش preload فالـ service worker ديال إضافة) |
| `renderer/` | الشريط، صفحة البداية، الإعدادات، المكتبة، صفحة الخطأ |
| `rules/trackers.json` | المتتبعين المحجوبين (نفس قائمة iPhone) |
| `test/` | tests ديال Node (`npm test`) |
| `tools/smoke-electron.js` | كيشغّل التطبيق بصح وكيتأكد من الأساسيات (Playwright) |
| `tools/smoke-iphone.js` | كيشغّل Noor iPhone بحال مستخدم وكيتأكد أن الصفحة، الـ frames، الـ workers والنوافذ كيشوفو iPhone |
| `tools/build-iphone.js` | كيبني الـ `.exe` ديال Noor iPhone |
| `tools/dump-surface.js`, `tools/iphone_surface.js` | كيولّدو `scripts/parts/iphone-surface.js` (شنو كاين فـ Chromium وماكاينش فـ Safari) |
| `.github/workflows/build.yml` | البناء ديال `.exe` على Windows |

## التطوير 🛠️

```
npm install
npm start          # كيشغّل التطبيق
npm test           # tests
npm run dist       # كيبني .exe فـ dist/ (على Windows)
npm run start:iphone   # كيشغّل Noor iPhone
npm run dist:iphone    # كيبني .exe ديال Noor iPhone
xvfb-run -a node tools/smoke-iphone.js   # test كامل ديال Noor iPhone
```

باش تجدّد الحماية من كود iPhone:

```
python3 tools/extract_from_ios.py ../Amir/AmirBrowser/FingerprintProtection.swift
```

ملي تجدّد `electron-chrome-extensions`، عاود ولّد الكود ديالها للـ service workers ديال الإضافات (`scripts/extension-sw-preload.js` و`scripts/extension-sw-bridge.js`؛ كيخدمو غير فالإضافات، ماشي فالمواقع):

```
node tools/build-extension-preload.js
xvfb-run -a node tools/smoke-extensions.js   # test كامل ديال الإضافات
```

باش تدير إصدار: `git tag v1.0.1 && git push --tags`، والـ workflow كيبني وكيعلّق الـ `.exe` فالـ Release.
