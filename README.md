# Noor لـ Windows 🛡️

متصفح خاص لـ Windows، بنفس الفكرة ديال [تطبيق Noor ديال iPhone](https://github.com/kamaltv1010-boop/Amir): **بروفايلات** كل واحد ببصماته والبيانات ديالو، **حماية ضد البصمات** (Canvas، WebGL، الصوت، ClientRects، الشاشة، البروسيسور)، **حجب المتتبعين**، **HTTPS**، **روابط نقية**، و**جلسة جديدة** بضغطة. مبني بـ Electron (Chromium)، وكيتبنى `.exe` أوتوماتيكياً فـ GitHub Actions.

## التحميل ⬇️

- **Releases** (https://github.com/kamaltv1010-boop/noor-windows/releases): كل build كيولي Release بوحدو، فيه `Noor-<version>-windows-x64-portable.exe` (portable، بلا تنصيب) و`Noor-Setup-<version>-windows-x64.exe` (installer). كل النسخ القديمة كتبقى هناك، وتقدر ترجع لأي وحدة فيهم.
- **Actions**: نفس الملفين كاينين حتى فـ artifact ديال كل run (90 يوم، وخاصك تكون مسجّل فـ GitHub).

الـ `.exe` ماشي موقّع (code signing)، فـ Windows SmartScreen غادي يسوّل أول مرة: **More info** ← **Run anyway**.

**الإصدار**: كل build عندو رقم بوحدو، `1.0.<رقم الـ run>` (مثلاً `1.0.4` = run 4)، والـ Release كياخد رقم الـ tag ديالو. كيبان فآخر القائمة ⋯، فـ الإعدادات ← About، وفسمية الملف.

## شنو فيه ✨

- **الملفات الشخصية (Profiles) 👤**: زر «👤 Personal ▾» فالشريط وفصفحة البداية، وقسم فالإعدادات. كل بروفايل عندو الـ cookies والبيانات ديال المواقع ديالو (partition ديال Chromium بوحدو)، السجل ديالو، الـ onglets ديالو، والبصمات ديالو. **ملف شخصي جديد** كيصاوب واحد ويحلو، **Delete** كتمسحو مع كل البيانات ديالو، و**Delete All** كتمسح كلشي ما عدا الأول بضغطة وحدة. المفضلة والإعدادات مشتركين.
- **المنطقة الزمنية ديال الـ IP 🕒**: الصفحات كتشوف المنطقة الزمنية ديال البلاصة فين كاين الاتصال ديالك (ديال الـ VPN إلا كان مشعل)، بحال زائر حقيقي من تماك، بلا ما تبدل شي حاجة فWindows. كتتعاود كل 15 دقيقة، وتقدر تطفيها من الإعدادات.
- **الحماية ضد البصمات 🎨**: الصفحات كتشوف Canvas وWebGL وصوت فيهم ضجيج صغير (نفس الطريقة والكود ديال نسخة iPhone: `scripts/protect.js` كيتولّد من `FingerprintProtection.swift`)، قياسات ClientRects مزحزحة شوية (الصوت وClientRects طافيين فالبداية: فالـ PC هاد القيم تقريباً نفسها عند الجميع، فالضجيج فيهم كيبيّن المتصفح بدل ما يخبيه)، وشاشة وعدد cores ديال PC عادي آخر (دائماً أكبر أو يساوي الشاشة الحقيقية). الحماية كتوصل حتى للـ Web Workers والـ Service Workers، باش الصفحة ما تلقاش فرق بيناتهم. القيم كتبقى ثابتة فنفس الموقع فنفس البروفايل، وكتتبدل من موقع لآخر. **New** حدا كل حماية كيعطي قيم جديدة، و**Change All** كيبدّل الكل.
- **Google Chrome 🪟**: المواقع كتشوف Chrome على Windows بنفس الإصدار ديال Chromium اللي فالتطبيق، بلا أثر ديال Electron: الـ user agent، الـ brands ديال `navigator.userAgentData` وديال headers `Sec-CH-UA` (مع Google Chrome)، `chrome.app/csi/loadTimes`، و`navigator.webdriver = false`.
- **الإضافات (Extensions) 🧩**: إضافات Chrome كتخدم فـ Noor بحال نسخة iPhone. حل صفحة ديال إضافة فـ **Chrome Web Store** وضغط **«🧩 Add to Noor»** فالشريط: Noor كيجيبها من نفس البلاصة اللي كيجيبها منها Chrome، كيتأكد من التوقيع ديالها، كيوريك شنو تقدر دير، وكيزيدها. تقدر تزيد حتى من ملف `.crx` ولا `.zip` ولا folder فيه `manifest.json` (الإعدادات › Extensions). الأزرار ديالها كيبانو فالشريط (مع الـ popup ديالها)، والـ items ديالها فقائمة الكليك اليمين. إضافات الـ store كيتجددو بوحدهم بحال Chrome. فالإعدادات تقدر تطفي ولا تمسح كل وحدة، ولا تحل الـ Options ديالها. كيخدمو فالـ onglets العاديين ديال كل البروفايلات؛ الـ onglets الخاصة بلا إضافات (بحال Incognito ديال Chrome)، وحتى ملي يكون «مسح كل شيء عند الخروج» مشعل، حيت Chromium ما كيقدرش يخدّم إضافات فين ما كيتحفظ والو.
- **الدروع (Shields) 🛡️**: حجب الملفات ديال المتتبعين من طرف ثالث (Meta، Google Analytics، TikTok…، نفس القائمة ديال iPhone فـ `rules/trackers.json`)، فتح `http://` على `https://` (والرجوع لـ `http://` إلا الموقع ما كيدعمش)، وحذف `fbclid`/`gclid`/`utm_*` من الروابط. الزر 🛡 فشريط العنوان كيبيّن شحال من متتبع تحجب، وكيخليك تطفي الدروع لموقع واحد.
- **مواقع تسجيل الدخول**: Meta (Instagram، Facebook…)، Google، Apple وMicrosoft كيشوفو الشاشة والـ hardware الحقيقيين (مع الضجيج ديال Canvas/WebGL/الصوت)، بحال نسخة iPhone.
- **جلسة جديدة 🔥**: كتمسح الـ cookies والبيانات والسجل ديال البروفايل المحلول، كتسد الـ onglets ديالو، وكتعطيه بصمات جديدة. **مسح كل شيء عند الخروج** فالإعدادات: البيانات كتبقى غير فالذاكرة، وكل تشغيل كيبدا بجلسة جديدة.
- **Onglets خاصة 🕶️**: `Ctrl+Shift+N`. ما كيتسجلوش فالسجل، والبيانات ديالهم كتمشي ملي تسد آخر onglet خاص.
- **المفضلة والسجل 📚**: ☆ فالشريط، صفحة البداية كتبيّن المفضلة، و`Ctrl+H` كيحل المكتبة.
- **الوضع الليلي 🌙**، **Zoom**، **بحث فالصفحة** `Ctrl+F`، **Developer Tools** `F12`.
- **الأذونات**: الكاميرا، الميكرو، الموقع والإشعارات مرفوضين تلقائياً.

## كيفاش خدام ⚙️

- **Electron + Chromium**: نافذة وحدة (`BaseWindow`) فيها شريط (`renderer/chrome.html`) وonglet لكل صفحة (`WebContentsView`).
- **الحماية**: `scripts/preload.js` كيخدم فكل frame قبل أي script ديال الصفحة (sandboxed، فنفس العالم ديال الصفحة). كيسوّل الـ main process على الإعدادات ديال الصفحة (`noor:page-config`): البذور (seeds) ديال البروفايل، الشاشة، الـ hardware، والـ brands، وكيطبّق `protectPage(window, config)`. الصفحات ديال التطبيق نفسو (`noor://app/…`) كياخدو `window.noor` باش يهضرو مع الـ main process.
- **البروفايلات**: كل بروفايل عندو partition `persist:noor-<id>` (ملف `settings.json` كيحفظ القائمة، البذور، والـ onglets المفتوحة بمفاتيح `profile.<id>.…`)، وملف سجل بوحدو. الحذف كيمسح البيانات بـ `clearStorageData` وكيحيّد المجلد ديال الـ partition فالتشغيل الجاي.
- **الدروع**: `session.webRequest.onBeforeRequest` كيحجب الملفات ديال المتتبعين، و`onBeforeSendHeaders` كيصلّح `Sec-CH-UA`. الـ HTTPS والروابط النقية كيتطبقو قبل كل تنقل.

## الفرق مع نسخة iPhone 📱

- ما كاينش «وضع iPad» ولا user agent عشوائي: على PC، المواقع كتشوف Chrome على Windows (أحسن تمويه هو اللي كيشبه أغلب الناس).
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
| `renderer/` | الشريط، صفحة البداية، الإعدادات، المكتبة، صفحة الخطأ |
| `rules/trackers.json` | المتتبعين المحجوبين (نفس قائمة iPhone) |
| `test/` | tests ديال Node (`npm test`) |
| `tools/smoke-electron.js` | كيشغّل التطبيق بصح وكيتأكد من الأساسيات (Playwright) |
| `.github/workflows/build.yml` | البناء ديال `.exe` على Windows |

## التطوير 🛠️

```
npm install
npm start          # كيشغّل التطبيق
npm test           # tests
npm run dist       # كيبني .exe فـ dist/ (على Windows)
```

باش تجدّد الحماية من كود iPhone:

```
python3 tools/extract_from_ios.py ../Amir/AmirBrowser/FingerprintProtection.swift
```

ملي تجدّد `electron-chrome-extensions`، عاود ولّد الـ preload ديال الـ service workers ديال الإضافات (كيخدم غير فالإضافات، ماشي فالمواقع):

```
node tools/build-extension-preload.js
xvfb-run -a node tools/smoke-extensions.js   # test كامل ديال الإضافات
```

باش تدير إصدار: `git tag v1.0.1 && git push --tags`، والـ workflow كيبني وكيعلّق الـ `.exe` فالـ Release.
