# Noor لـ Windows 🛡️

متصفح خاص لـ Windows، بنفس الفكرة ديال [تطبيق Noor ديال iPhone](https://github.com/kamaltv1010-boop/Amir): **بروفايلات** كل واحد ببصماته والبيانات ديالو، **حماية ضد البصمات** (Canvas، WebGL، الصوت، ClientRects، الشاشة، البروسيسور)، **حجب المتتبعين**، **HTTPS**، **روابط نقية**، و**جلسة جديدة** بضغطة. مبني بـ Electron (Chromium)، وكيتبنى `.exe` أوتوماتيكياً فـ GitHub Actions.

وكاينة حتى **[Noor iPhone](#noor-iphone-)**: نفس المتصفح على Windows، ولكن المواقع كتشوف فيه iPhone ولا iPad حقيقي فيه Safari. و**[Noor Android](#noor-android-)**: المواقع كتشوف فيه تيليفون ولا تابليت Android حقيقي فيه Chrome.

## التحميل ⬇️

- **Releases** (https://github.com/kamaltv1010-boop/noor-windows/releases): كل build كيولي Release بوحدو، فيه `Noor-<version>-windows-x64-portable.exe` (portable، بلا تنصيب) و`Noor-Setup-<version>-windows-x64.exe` (installer). كل النسخ القديمة كتبقى هناك، وتقدر ترجع لأي وحدة فيهم.
- **Noor iPhone**: فنفس الـ Release، `Noor-iPhone-<version>-windows-x64-portable.exe` (portable) و`Noor-iPhone-Setup-<version>-windows-x64.exe` (installer).
- **Noor Android**: فنفس الـ Release، `Noor-Android-<version>-windows-x64-portable.exe` (portable) و`Noor-Android-Setup-<version>-windows-x64.exe` (installer).
- **Actions**: نفس الملفات كاينين حتى فـ artifact ديال كل run (90 يوم، وخاصك تكون مسجّل فـ GitHub).

الـ `.exe` ماشي موقّع (code signing)، فـ Windows SmartScreen غادي يسوّل أول مرة: **More info** ← **Run anyway**.

**الإصدار**: كل build عندو رقم بوحدو، `1.0.<رقم الـ run>` (مثلاً `1.0.4` = run 4)، والـ Release كياخد رقم الـ tag ديالو. كيبان فآخر القائمة ⋯، فـ الإعدادات ← About، وفسمية الملف.

## شنو فيه ✨

- **الملفات الشخصية (Profiles) 👤**: زر «👤 Personal ▾» فالشريط وفصفحة البداية، وقسم فالإعدادات. كل بروفايل عندو الـ cookies والبيانات ديال المواقع ديالو (partition ديال Chromium بوحدو)، السجل ديالو، الـ onglets ديالو، والبصمات ديالو. **كل بروفايل كيتحل فنافذة ديالو** (بحال Octo): كتختار بروفايل من «👤 ▾» ولا **Open** فالإعدادات، وكيتحل فنافذة جديدة **قد الشاشة كاملة** (فـ Noor iPhone قد الـ iPhone)، والنافذة اللي كنتي فيها كتبقى كيف ما هي. تقدر تخدم بزاف ديال البروفايلات فنفس الوقت، كل واحد فنافذة. إلا كان البروفايل محلول ديجا، النافذة ديالو كتجي لقدام. كل نافذة عندها **زر بوحدها فالـ taskbar** لتحت، بأيقونة فيها سمية البروفايل على لون ديالو (مثلا «Shop / 7» على الأحمر)، والزر ديال الشريط كياخد نفس اللون. البروفايل الأول (Personal) كيبقى بأيقونة Noor. تقدر **تثبّت** (Pin to taskbar) نافذة ديال بروفايل، والزر المثبّت كيحل داك البروفايل نيشان. **ملف شخصي جديد** كيصاوب واحد ويحلو فنافذة جديدة. **Create multiple profiles** (فالإعدادات ولا ⋯ ← Profile ← **Create Multiple Profiles…**) كيصاوب بزاف دفعة وحدة (حتى 100) بلا ما يحل نوافذ، كل واحد بالكوكيز والبصمات ديالو: «Profile 3، Profile 4…» ولا بالسمية اللي بغيتي. **Replace a profile when closed** (فالإعدادات): ملي كتسد النافذة ديال بروفايل، كيتمسح بوحدو مع كاع البيانات ديالو (الكوكيز، السجل، الـ onglets)، وكيتصاوب بروفايل جديد **بالرقم اللي من بعد**: إلا كان أكبر رقم «Profile 11»، الجديد كيكون «Profile 12»، ومن بعد «Profile 13»… كيطلع بالتدريج، ببصمات جديدة وبلا كوكيز. إلا كان **Collect in every new profile** مشعول، الجديد كيبدا يجمع الكوكيز بوحدو (وإلا سديتي Noor كامل، كيبدا فالتشغيل الجاي). البروفايل الأول عمرو ما كيتمسح. **Delete** كتمسح بروفايل مع كل البيانات ديالو (والنافذة ديالو كتسد)، و**Delete All** كتمسح كلشي ما عدا الأول بضغطة وحدة. ملي كتعاود تحل Noor، كيتحلو النوافذ اللي كانو محلولين ملي سديتيه. المفضلة والإعدادات مشتركين.
- **جمع الكوكيز 🍪**: فالإعدادات › **Cookies** (ولا القائمة ⋯ ← Profile ← **Collect Cookies…**) ضغط **Collect**. Noor كيزور مواقع فـ onglet مخفي ديال داك البروفايل، بالكوكيز والبصمات والدروع ديالو هو (وفـ Noor iPhone بالـ iPhone ديالو)، **فالخلفية**: تقدر تخدم فأي بروفايل آخر، والتبديل ما كيوقفش الجمع. **بزاف ديال البروفايلات كيجمعو فنفس الوقت**، كل واحد فـ onglet مخفي ديالو: **At once** كيحدد شحال: **All** (الأصل) = كلهم مرة وحدة، حتى للعدد اللي يقدر عليه الـ PC ديالك (حسب الذاكرة والبروسيسور: مثلا 12 فـ 8 GB، و16 حتى 32 فـ 16 GB، وما كيفوتش 50)، ولا عدد اللي بغيتي (1 = واحد بواحد). اللي فاتو العدد كيتسناو الدور ديالهم، وكل واحد كيبدا شي ثواني من بعد الآخر باش ما يتحلّوش كاع المواقع فنفس الثانية. **Collect in All** كيجمع فكل البروفايلات فنفس الوقت، وفصفحة الكوكيز كاين **Collect** لأي بروفايل. الهدف أن أي موقع كيشيكي الكوكيز يلقى بروفايل مستعمل، ماشي خاوي. ف كل موقع: كيقرا الصفحة شوية، كيسكرولي بحال إنسان (بالصبع فـ Noor iPhone، بالماوس فـ Noor)، كيقبل البانر ديال الكوكيز، وأحيانا كيدخل لصفحة أخرى من نفس الموقع. كتختار **المواقع**: إما **Popular sites** (خليط عشوائي جديد كل مرة من مواقع العالم ومواقع البلاد ديال المنطقة الزمنية ديالك، ومن المغرب: هسبريس، أفيتو، جوميا…) وكتحدد **شحال من موقع** (من 1 حتى 200)، ولا **My sites** وكتكتب المواقع ديالك (واحد فكل سطر). **Collect in every new profile**: كل بروفايل جديد كيبدا يجمع الكوكيز بوحدو ملي يتصاوب، والبروفايلات اللي تصاوبو دفعة وحدة (**Create multiple profiles**) كيبداو يجمعو كاملين فنفس الوقت. **Save** كيحفظ هاد الاختيارات. ما كيدخلش أبدا لروابط تسجيل الدخول ولا الخروج، الحساب، السلة، التحميل، **ولا البحث** (النتائج ديال Google، Bing، YouTube، Amazon…، حتى «Recherches populaires» اللي فالصفحة ديال Google): محرّك البحث كيحسب البحوث اللي جاية من نفس الـ IP، وبزاف ديال البروفايلات كيقلبو فنفس الوقت كيبانو ليه robot، وكيولي يطلب CAPTCHA («unusual traffic») لكل متصفح فداك الـ IP. ما كيحلّش نوافذ، ما كيبانش، ما كيصوّتش، وما كيكتب والو فالسجل. كتشوف التقدم (العدد ديال الكوكيز كيتزاد مباشرة)، و**Stop** / **Stop All** كيوقفو فأي وقت. حذف بروفايل ولا **جلسة جديدة** كيوقفو الجمع ديالو.
- **صفحة الكوكيز 🔎**: **See Cookies** (فالإعدادات ولا القائمة ⋯ ← Profile) كتوريك كل الكوكيز ديال أي بروفايل، موقع بموقع (الاسم، القيمة، الدومين، تاريخ الانتهاء، Secure/HttpOnly/SameSite). فيها بحث، والكليك على قيمة كينسخها. **Delete** كيمسح الكوكيز ديال موقع واحد. **Save as File…** كيحفظهم كاملين فملف `cookies.txt` (نفس الصيغة ديال إضافات «Get cookies.txt» و curl و yt-dlp) ولا JSON.
- **المنطقة الزمنية ديال الـ IP 🕒**: الصفحات كتشوف المنطقة الزمنية ديال البلاصة فين كاين الاتصال ديالك (ديال الـ VPN إلا كان مشعل)، بحال زائر حقيقي من تماك، بلا ما تبدل شي حاجة فWindows. Noor كيشوف الـ IP ديالك كل 30 ثانية (صفحة صغيرة ديال Cloudflare)، وملي كيتبدل (شعلتي VPN، طفيتيه، ولا بدلتي البلاد) كيجيب المنطقة الزمنية الجديدة وكتبان فالصفحات فأقل من دقيقة. فالإعدادات كتبان الـ IP اللي كتشوفو المواقع، البلاد ديالو، والمنطقة الزمنية ديالو، مع **Check Now** باش يشوف دابا. وتقدر تطفيها من الإعدادات. (إلا كان الـ IP ديالك مغربي، المنطقة كتبقى Africa/Casablanca، وهادي هي الصحيحة.)
- **الحماية ضد البصمات 🎨**: الصفحات كتشوف Canvas وWebGL وصوت فيهم ضجيج صغير (نفس الطريقة والكود ديال نسخة iPhone: `scripts/protect.js` كيتولّد من `FingerprintProtection.swift`)، قياسات ClientRects مزحزحة شوية: غير العرض والطول ديال النص (span فيه نص، ولا range داخل نص واحد)، اللي كيقررهم الخط؛ القياسات اللي الصفحة حطّاتها بيدها (block، صورة، 100.5px…) والبلايص (x، y) كيبقاو كيف ما هوما، باش الموقع ما يقدرش يكشف الضجيج بالمقارنة (`tools/probe-lies.js`) (الصوت وClientRects طافيين فالبداية: فالـ PC هاد القيم تقريباً نفسها عند الجميع، فالضجيج فيهم كيبيّن المتصفح بدل ما يخبيه)، وشاشة وعدد cores ديال PC عادي آخر (دائماً أكبر أو يساوي الشاشة الحقيقية، ومن الشاشات اللي Windows كيعرضهم بنفس الـ zoom ديال الـ PC ديالك: إلا كان الـ zoom ‏225%، الشاشة كتكون ديال laptop كيتعرض بـ 225%، ماشي شاشة عريضة اللي غادي تولي 7740×3240 ما كايناش). الحماية كتوصل حتى للـ Web Workers (وحتى worker داخل worker)، للـ Shared Workers وللـ Service Workers، وللـ frames والنوافذ اللي كتحل الصفحة، باش الصفحة ما تلقاش فرق بيناتهم. حجم الشاشة كيوريه Chromium نفسو للصفحة، فالـ CSS (`@media (device-width)`) والـ JavaScript متوافقين. القيم كتبقى ثابتة فنفس الموقع فنفس البروفايل، وكتتبدل من موقع لآخر. **New** حدا كل حماية كيعطي قيم جديدة، و**Change All** كيبدّل الكل.
- **الخطوط (Fonts) ديال كل بروفيل 🔤**: كل بروفيل عندو قائمة خطوط ديالو. المواقع كتلقى الخطوط اللي كيجيو مع كل Windows 10 و11، وزيد عليهم خطوط خاصة بالبروفيل، كيختارهم Noor من الـ seed ديالو بحال PC فيه برامج ولغات مختلفة: خطوط Office (فشي نص ديال البروفيلات)، Adobe Acrobat، خطوط العربية ديال Windows، اليابانية…، LibreOffice، وشي خطوط معروفة (Roboto، Lato، Fira Code…) (`rules/font-pool.json`). هكا كل بروفيل كيبان بخطوط مختلفة، والمواقع ما تقدرش تربط بيناتهم بالخطوط. الخط اللي اختارو البروفيل وكاين فالـ PC كيبان بحالو، واللي ما كاينش كيرسمو Noor بخط ديال Windows من نفس النوع بقياس ديالو (الموقع كيلقاه من أول سطر ديال السكريبت ديالو، فالصفحة، فـ canvas وبـ `local()`)، والتحميل ديالو ما كيبانش للصفحة (`document.fonts` كيبقى «loaded» وما كيطلع حتى event). الخطوط الأخرى ديال الـ PC (اللي زادوهم برامج أخرى) كيتخباو فكل البروفيلات. فالإعدادات › Fingerprint protection › **Fonts**: **New** كيعطي للبروفيل خطوط أخرى، والـ switch كيطفيها (كيبانو الخطوط الحقيقية ديال الـ PC)، وتحت فـ **Fonts** كتبان القائمة ديال البروفيل. Noor كيقرا القائمة ديال الخطوط ديال الـ PC بوحدو وكيحفظها للمرة الجاية. ما جاتش حتى ملف ديال الخطوط مع البرنامج، غير الأسماء (`rules/windows-fonts.json`)، حيت الخطوط ديال Microsoft ما مسموحش ننشروهم وكاينين ديجا فكل Windows. والخطوط اللي الصفحة كتجيبهم معاها (web fonts) كيخدمو عادي. (Noor iPhone عندو الخطوط ديال iPhone.)
- **الكارت ديال الرسم (WebGL Vendor & Renderer) ديال كل بروفيل 🖥️**: كل بروفيل كيبان بكارت ديال الرسم ديالو، واحد من الكارتات اللي كاينين بزاف فالـ PCs (NVIDIA GeForce GTX/RTX، Intel UHD/Iris Xe، AMD Radeon: 26 كارت، `main/gpus.js`)، بحال ما كيعطيه Chrome على Windows: **WebGL Vendor** `Google Inc. (NVIDIA)` و**WebGL Renderer** `ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)`، وفـ WebGPU الشركة والعائلة (`nvidia` · `ampere`). فالصفحة، فالـ frames وفالـ workers، حتى فمواقع تسجيل الدخول. فالإعدادات › Fingerprint protection › **WebGL Vendor & Renderer**: **New** كيعطي للبروفيل كارت آخر، والـ switch كيطفيه (كيبان الكارت الحقيقي ديال الـ PC)، وتحت كيبانو **WebGL Vendor** و**WebGL Renderer** ديال البروفيل. (الرسم نفسو كيبقى بالكارت الحقيقي، مع الضجيج ديال WebGL؛ وفـ WebGPU الحدود والـ features كيبقاو ديال الكارت الحقيقي.)
- **البطارية 🔋**: `navigator.getBattery()` كيعطي فكل بروفيل PC مشحون ومكونيكطي للضو (`level` 1، `charging` true)، بلاصة البطارية الحقيقية ديال الـ PC، اللي جوج بروفيلات كيقراوها فنفس الوقت كانت غادي تكون نفسها وتربط بيناتهم. الأحداث ديال البطارية الحقيقية ما كيوصلوش للصفحة. مع **Processor & Memory**.
- **Google Chrome 🪟**: المواقع كتشوف Chrome على Windows بنفس الإصدار ديال Chromium اللي فالتطبيق، بلا أثر ديال Electron: الـ user agent، الـ brands ديال `navigator.userAgentData` وديال headers `Sec-CH-UA` (مع Google Chrome)، `chrome.app/csi/loadTimes` (بنفس الشكل والقيم ديال Chrome)، `navigator.webdriver = false`، الأذونات بحال Chrome جديد (اللي Chrome كيعطيه بلا سؤال كيتعطى، والباقي كيبان «prompt»)، الأصوات ديال Google فـ `speechSynthesis`، وWidevine (الطلبات ديالو كتجاوب بحال Chrome بالضبط، بـ ClearKey حقيقي من التحت؛ الأفلام المحمية مازال ما كتخدمش). الـ headers ديال كل طلب كيمشيو **بنفس الترتيب ديال Chrome** (Accept-Language وUser-Agent فالبلايص ديالهم، بحال ما كيقراهم JA4H ديال Cloudflare). اللي Chrome حيدو وElectron باقي عندو ما كيبانش: XSLT (`XSLTProcessor`) والـ APIs ديال الإشهار ديال Privacy Sandbox (`navigator.joinAdInterestGroup`، `runAdAuction`…). واللي زادو Electron وChrome ما عندوش حتى هو ما كيبانش: الخاصية `-electron-corner-smoothing` ديال CSS (سطر واحد، `CSS.supports("-electron-corner-smoothing", "50%")`، كان كيبيّن بلي هادا Electron، وهادشي اللي كيقلبو عليه الـ bot checks بحال pixelscan). ملي كتكتب رابط فشريط العنوان وكتورك Enter، الصفحة كتاخد الـ focus بحال Chrome. الـ popups اللي كتحلها صفحة بوحدها بلا كليك ديالك كيتبلوكاو بحال Chrome. صفحة ديال موقع ما تقدرش توصل للـ PC ديالك ولا للشبكة المحلية (127.0.0.1، 192.168.…)، بحال Chrome اللي كيسول قبل (وهكا ما تقدرش تقلب على الـ ports اللي محلولين فالـ PC). والـ onglets كاملين كيبقاو فالنافذة (غير المخبيين ما كيبانوش)، والصفحات كتبدا تحمّل غير ملي النافذة كتبان: هكا `outerWidth`/`outerHeight` عمرهم ما كيكونو 0 بحال متصفح headless.
- **الإضافات (Extensions) 🧩**: إضافات Chrome كتخدم فـ Noor بحال نسخة iPhone. حل صفحة ديال إضافة فـ **Chrome Web Store** وضغط **«🧩 Add to Noor»** فالشريط: Noor كيجيبها من نفس البلاصة اللي كيجيبها منها Chrome، كيتأكد من التوقيع ديالها، كيوريك شنو تقدر دير، وكيزيدها. تقدر تزيد حتى من ملف `.crx` ولا `.zip` ولا folder فيه `manifest.json` (الإعدادات › Extensions). الأزرار ديالها كيبانو فالشريط (مع الـ popup ديالها)، والـ items ديالها فقائمة الكليك اليمين. إضافات الـ store كيتجددو بوحدهم بحال Chrome. فالإعدادات تقدر تطفي ولا تمسح كل وحدة، ولا تحل الـ Options ديالها. الـ background (service worker) ديال كل إضافة عندو نفس الـ API اللي عند الصفحات ديالها (الـ onglets، النوافذ، الـ cookies، القوائم…)، باش إضافة بحال «Get cookies.txt» تلقى الصفحة اللي حالّة حتى والـ popup ديالها محلول. كيخدمو فالـ onglets العاديين ديال كل البروفايلات؛ الـ onglets الخاصة بلا إضافات (بحال Incognito ديال Chrome)، وحتى ملي يكون «مسح كل شيء عند الخروج» مشعل، حيت Chromium ما كيقدرش يخدّم إضافات فين ما كيتحفظ والو.
- **الدروع (Shields) 🛡️**: حجب الملفات ديال المتتبعين من طرف ثالث (Meta، Google Analytics، TikTok…، نفس القائمة ديال iPhone فـ `rules/trackers.json`)، فتح `http://` على `https://` (والرجوع لـ `http://` إلا الموقع ما كيدعمش)، وحذف `fbclid`/`gclid`/`utm_*` من الروابط. الزر 🛡 فشريط العنوان كيبيّن شحال من متتبع تحجب، وكيخليك تطفي الدروع لموقع واحد.
- **مواقع تسجيل الدخول**: Meta (Instagram، Facebook…)، Google، Apple وMicrosoft كيشوفو الشاشة والـ hardware الحقيقيين (مع الضجيج ديال Canvas/WebGL/الصوت)، بحال نسخة iPhone.
- **جلسة جديدة 🔥**: كتمسح الـ cookies والبيانات والسجل ديال البروفايل المحلول، كتسد الـ onglets ديالو، وكتعطيه بصمات جديدة. **مسح كل شيء عند الخروج** فالإعدادات: البيانات كتبقى غير فالذاكرة، وكل تشغيل كيبدا بجلسة جديدة. وحتى هكا الصفحات كتشوف نفس البلاصة (storage quota) اللي كتشوفها فنافذة Chrome عادية على الديسك ديالك (شحال خاوي فيه، حتى 60% منو)، ماشي ديال Incognito (بلاصة صغيرة من الذاكرة، اللي كتخلي pixelscan يقول «Incognito Window»)؛ فالصفحة، فالـ workers وفـ `webkitTemporaryStorage`. وإلا كان الديسك تقريباً عامر (أقل من 16 GB خاوية)، الصفحات كتشوف 60% من الديسك، حيت البلاصة الصغيرة كتبان بحال Incognito حتى فـ Chrome الحقيقي (والموقع ما يقدرش يعرف شحال خاوي فالديسك).
- **Onglets خاصة 🕶️**: `Ctrl+Shift+N`. ما كيتسجلوش فالسجل، والبيانات ديالهم كتمشي ملي تسد آخر onglet خاص. كيبانو للمواقع بحال Incognito ديال Chrome (البلاصة الصغيرة ديال الذاكرة).
- **المفضلة والسجل 📚**: ☆ فالشريط، صفحة البداية كتبيّن المفضلة، و`Ctrl+H` كيحل المكتبة.
- **القوائم بحال Chrome 📋**: القائمة ⋯ والقوائم ديال 👤 و🛡 مرسومين بحال ديال Chrome: **أيقونة صغيرة حدا كل حاجة**، الاختصار على اليمين (`Ctrl+T`، `Ctrl+Shift+N`، `Ctrl+H`، `Ctrl+F`، `Ctrl+P`…)، والقوائم الفرعية كيتحلو على الجنب. فيها سطر ديال البروفايل بلونو (والبروفايلات كاملين بالحرف واللون ديالهم)، سطر ديال الـ **Zoom** (− 100% + والشاشة الكاملة) اللي كيبقى محلول ملي تكبّر ولا تصغّر، switch ديال **الوضع الليلي**، **Print…** و**Exit**. كيخدمو حتى بالكلافيي (الأسهم، Enter، Escape)، وكيتسدو ملي تكليكي برا.
- **الإعدادات بحال Chrome ⚙️**: شريط لفوق فيه **البحث**، والأقسام على اليسار بالأيقونات ديالهم (Profiles، Cookies، Extensions، Shields، Fingerprint protection، General، About Noor)؛ الكليك على قسم كيدّيك ليه، والقسم اللي كتشوف كيبان ملوّن. البحث كيخلي غير الإعدادات اللي فيها الكلمة اللي كتبتي (مع القسم ديالها)، و`Escape` كيمسحو. الخيارات اللي كتشعل وتطفى ولاو **switches** بحال Chrome.
- **الوضع الليلي 🌙**، **Zoom**، **بحث فالصفحة** `Ctrl+F`، **الطباعة** `Ctrl+P`، **Developer Tools** `F12`.
- **الأذونات**: الكاميرا، الميكرو، الموقع والإشعارات مرفوضين تلقائياً.

## Noor iPhone 📱

نسخة ثانية من نفس المتصفح، كتخدم على Windows، ولكن **كل بروفايل كيبان للمواقع بحال iPhone ولا iPad حقيقي فيه Safari**، بحال تطبيق Noor ديال iPhone.

- **iPhone حقيقي لكل بروفايل**: واحد من 20 iPhone (من iPhone SE حتى iPhone 16 Pro Max، ومن iOS 16 حتى iOS 26)، بالـ user agent ديال Safari ديالو، الشاشة ديالو، الدقة ديالو (2x ولا 3x)، واللمس (`ontouchstart`، `maxTouchPoints = 5`، `pointer: coarse`). الصفحة كتبان فوسط النافذة بعرض الـ iPhone، والماوس كيخدم بحال الصبع (tap وscroll).
- **بحال Safari**: الطلبات كتمشي بالـ headers ديال Safari (بلا `Sec-CH-UA`، بالترتيب ديالو، وبلغة وحدة). الحوايج اللي كاينين غير فـ Chrome محيدين (`window.chrome`، `userAgentData`، `Notification`…)، والحوايج ديال Safari زايدين (`ApplePaySession`، `GestureEvent`، `webkitEnterFullscreen`…). WebGL ديال «Apple GPU»، الأصوات ديال iOS، الخطوط ديال iPhone (والخطوط ديال Windows مخبيين)، الأذونات بحال Safari، والوقت بالـ millisecond. كلشي هادا حتى فالـ frames، فالـ workers، وفالنوافذ اللي كتحل الصفحة، وفكل المواقع (حتى مواقع تسجيل الدخول).
- **iPad حقيقي لكل بروفايل 📱↔️**: فالإعدادات › Profiles › **New profiles are** كتختار واش البروفايلات الجداد (واحد، بزاف دفعة وحدة، ولا اللي كيتصاوب فبلاصة واحد تسد بـ **Replace a profile when closed**) يكونو **iPhones** ولا **iPads**. البروفايلات اللي كانو قبل كيبقاو كيفما هوما: تحتها **This profile is** كيبدّل البروفايل ديال النافذة اللي فيها لـ iPhone ولا iPad (حتى فـ Fingerprint protection)، و**New iPad** كيعطيك iPad آخر. واحد من 18 iPad (iPad 9 و10 وA16، iPad Air، iPad mini، iPad Pro حتى M4، ومن iPadOS 17 حتى 26)، **مقلوب على الجنب** (landscape) بحال iPad فوق مكتب، وهكا كيدخل مزيان فشاشة الـ PC: الشاشة ديالو والدقة ×2 واللمس. النافذة ديال كل بروفايل كتحل قد الجهاز ديالو (ديال iPad عريضة قد الصفحة ديالو، ماشي قد النافذة ديال iPhone اللي تحلّات منها). بحال iPad حقيقي، Safari كيوري المواقع **نسخة الـ Mac** (desktop websites): الـ user agent ديال Safari على Mac، `navigator.platform = "MacIntel"`، والصفحة بعرض النافذة كيفما كان الـ viewport ديالها، والموقع كيعرف بلي iPad باللمس (`maxTouchPoints = 5`)؛ غير الـ **iPad mini** كياخد المواقع ديال اللمس (user agent ديال iPad، `platform = "iPad"`)، بحال اللي كيدير WebKit. وعند الـ iPad حتى الحوايج اللي ما عندهاش iPhone: **Fullscreen** ديال أي عنصر، و**MediaSource**، وعدد cores ديالو (8 فـ iPads ديال M1/M2/M3/M4، و4 فالآخرين). إلا كانت الشاشة ديال الـ PC صغيرة على عرض الـ iPad، Noor كيرسم الصفحة صغيرة شوية باش تدخل، والموقع كيشوف نفس القياسات.
- **الحماية**: Canvas، WebGL، الصوت وClientRects مشعلين من الأول (بحال تطبيق iPhone). **New iPhone** (ولا **New iPad**) فالإعدادات (ولا فالقائمة ⋯ ← Fingerprint) كيعطيك جهاز آخر من نفس النوع، و**جلسة جديدة** حتى هي كتبدّل الجهاز مع البصمات.
- **بوحدو**: عندو البروفايلات والبيانات ديالو (مجلد `Noor iPhone`)، ما كيختلطوش مع Noor. تقدر تنصّب جوج بجوج.

**الحدود** ⚠️:

- المحرك من الداخل باقي Chromium، ماشي WebKit ديال Safari. أغلب المواقع ما كتفرقش، ولكن الفحص العميق (بحال البصمة ديال الاتصال TLS/HTTP2، ولا تفاصيل دقيقة ديال JavaScript وCSS) يقدر يعرف بلي ماشي Safari حقيقي.
- باش الـ frames ديال مواقع أخرى ياخدو حتى هوما الشاشة واللمس ديال الـ iPhone، Noor iPhone كيطفي «Site Isolation» ديال Chromium: المواقع فيه أقل معزولة على بعضياتها من Noor العادي.

## Noor Android 🤖

نسخة ثالثة من نفس المتصفح، كتخدم على Windows، ولكن **كل بروفايل كيبان للمواقع بحال تيليفون ولا تابليت Android حقيقي فيه Chrome**. فيها كاع الحوايج ديال Noor iPhone: البروفايلات، كل بروفايل فنافذة ديالو، جمع الكوكيز (بالصبع)، الحماية، الإعدادات…

- **تيليفون ولا تابليت لكل بروفايل**: فالإعدادات › Profiles › **New profiles are** كتختار **Phones** ولا **Tablets** للبروفايلات الجداد (واحد، بزاف دفعة وحدة، ولا اللي كيتصاوب فبلاصة واحد تسد)، و**This profile is** كيبدّل البروفايل ديال النافذة. واحد من 40 تيليفون ولا 8 تابليت، من Android 13 حتى 15:
  - **Samsung (18)**: Galaxy S25، S24 Ultra، S24، S23، S23 Ultra، S22، A54، A35، A34، A53، A52، A25، A24، A16 5G، A15 5G، A15، A14، A05s
  - **Google (9)**: Pixel 9، 8 Pro، 8، 8a، 7 Pro، 7، 7a، 6، 6a
  - **Xiaomi (9)**: Redmi Note 13 Pro، Note 13 5G، Note 13، Note 12 Pro 5G، Note 12، Redmi 13C، Redmi 12، POCO F5، POCO X5 Pro 5G
  - **OnePlus (3)**: OnePlus 12، OnePlus 11، Nord CE 3 Lite 5G · **Nothing (1)**: Phone (2)
  - **التابليتات (8)**: Galaxy Tab S9، Tab S8، Tab A9+، Tab S6 Lite، Pixel Tablet، Lenovo Tab P11 (2nd Gen)، Xiaomi Pad 6، Redmi Pad SE

   التيليفون واقف، والتابليت مقلوب على الجنب، والنافذة قد الجهاز.
- **البروسيسور والكارت ديال الرسم ديال كل جهاز**: كل تيليفون عندو البروسيسور اللي خرج معاه (Snapdragon، Exynos، Google Tensor، Helio، Dimensity)، بعدد الـ cores ديالو (`navigator.hardwareConcurrency`: مثلا 9 فـ Tensor G3)، والكارت ديال الرسم ديالو. المواقع كتشوفو فـ WebGL بحال ما كيعطيه Chrome على Android (عبر ANGLE): **WebGL Vendor** `Google Inc. (Qualcomm)` و**WebGL Renderer** `ANGLE (Qualcomm, Adreno (TM) 740, OpenGL ES 3.2)`، ولا `ANGLE (ARM, Mali-G57 MC2, OpenGL ES 3.2)` فـ Helio G99… وفـ WebGPU السمية ديال الشركة والعائلة (`qualcomm` · `adreno-7xx`، `arm` · `valhall`). فالإعدادات › Fingerprint protection كاين الخيار **WebGL Vendor & Renderer**: شاعل من الأول؛ إلا طفيتيه، المواقع كتشوف الكارت ديال الـ PC (ماشي مزيان لتيليفون).
- **الخطوط ديال Android لكل بروفايل**: الخيار **Fonts** (مع **New**): المواقع كتلقى الخطوط ديال Android (Roboto، Noto، Droid…)، ومن الخطوط Noto ديال Android للغات أخرى (العربية، تيفيناغ، الصينية، الهندية…) كل بروفايل عندو مجموعة ديالو، باش تكون بصمة الخطوط مختلفة من بروفايل لآخر. **New** كيعطي مجموعة جديدة. إلا طفيتيه، كاع الخطوط Noto كيبانو، بحال Android عادي.
- **بحال Chrome على Android**: الـ user agent ديال Chrome على Android (`Android 10; K`، و`Mobile` غير فالتيليفون)، والـ client hints ديالو فكل طلب وفـ `navigator.userAgentData`: `Android`، النسخة ديال Android، **الموديل** (مثلا `SM-S911B`، `Pixel 7`)، تيليفون ولا تابليت. الشاشة، الدقة (×2.625، ×3…)، اللمس (5 ولا 10 صوابع)، `navigator.platform` (`Linux aarch64` ولا `Linux armv8l`)، الذاكرة والـ cores ديال البروسيسور، الكارت ديال الرسم فـ WebGL وWebGPU، بلا plugins ولا PDF، الشبكة (`wifi`)، البطارية ديال تيليفون (مستوى ديالو لكل بروفايل)، `navigator.contacts`، الأصوات ديال Android، والخطوط ديال Android (Roboto، Noto، Droid…) والخطوط ديال Windows مخبيين. والحوايج اللي ما عندهاش Chrome على Android محيدين (Web HID، الـ screen capture، Picture-in-Picture ديال الصفحة…). كلشي هادا حتى فالـ frames، فالـ workers، وفالنوافذ اللي كتحل الصفحة.
- **نفس المحرك**: Chrome على Android هو Chromium حتى هو، فالمحرك، الاتصالات (TLS) والـ headers كيبانو للموقع بحال ديال Chrome على Android.
- **بوحدو**: عندو البروفايلات والبيانات ديالو (مجلد `Noor Android`)، ما كيختلطوش مع Noor ولا Noor iPhone.

**الحدود** ⚠️:

- الرسم (Canvas، WebGL) والخطوط كيتّرسمو بالـ GPU والخطوط ديال الـ PC، ماشي ديال التيليفون (مع الضجيج ديال الحماية).
- فـ WebGPU غير السمية ديال الكارت (الشركة والعائلة) اللي كتبدل؛ الحدود (limits) والـ features كيبقاو ديال الكارت ديال الـ PC.
- فـ worker عادي (dedicated)، شي حوايج ديال الصفحات الآمنة (بحال Web HID) كيبقاو، حيت Chromium كيزيدهم من بعد الحماية.

## كيفاش خدام ⚙️

- **Electron + Chromium**: نافذة (`BaseWindow`) لكل بروفايل محلول (`main/windows.js`)، فيها شريط (`renderer/chrome.html`) وonglet لكل صفحة (`WebContentsView`). كل نافذة ديال بروفايل عندها App User Model ID ديالها (`ma.noor.browser.profile.<id>`) باش Windows يعطيها زر بوحدها فالـ taskbar، وأيقونة `.ico` كتترسم فالشريط ديالها (`main/profile-icon.js`) وكتتحفظ فـ `ProfileIcons`. الزر المثبّت كيعاود يشغّل Noor بـ `--profile=<id>`.
- **الحماية**: `scripts/preload.js` كيخدم فكل frame قبل أي script ديال الصفحة (sandboxed، فنفس العالم ديال الصفحة). كيسوّل الـ main process على الإعدادات ديال الصفحة (`noor:page-config`): البذور (seeds) ديال البروفايل، الشاشة، الـ hardware، والـ brands، وكيطبّق `protectPage(window, config)`. الحماية كتتصاوب داخل frame خاوي ومخبّي (كيتحيّد قبل أول script ديال الصفحة)، باش الـ functions ديالها ما يبانوش فالـ stack ديال الأخطاء اللي كتقرا الصفحة (بحال الـ functions الأصلية ديال المتصفح)، وما يبانش المسار ديال الملف اللي فيه سمية المستخدم. فالـ Web Workers كتدخل ككود داخلي ديال DevTools، اللي حتى هو ما كيبانش؛ والـ Shared Workers والـ Service Workers كيتشدّو قبل أول سطر ديالهم من الـ target ديال Chromium نفسو (`main/browser-debugger.js`، بـ debugging port عشوائي على هاد الـ PC بوحدو). العلامات اللي كتعرف بيها الحماية الـ functions ديالها والـ frame المخبّي كيتبدلو مع كل تشغيل، فحتى صفحة ما تقدر تعرفهم ولا تقلّدهم. الصفحات ديال التطبيق نفسو (`noor://app/…`) كياخدو `window.noor` باش يهضرو مع الـ main process.
- **البروفايلات**: كل بروفايل عندو partition `persist:noor-<id>` (ملف `settings.json` كيحفظ القائمة، البذور، والـ onglets المفتوحة بمفاتيح `profile.<id>.…`)، وملف سجل بوحدو. الحذف كيمسح البيانات بـ `clearStorageData` وكيحيّد المجلد ديال الـ partition فالتشغيل الجاي. البروفايل اللي كيتعوّض ملي يتسد كياخد `id` جديد (partition جديد، بصمات جديدة) والسمية اللي من بعد فالسلسلة ديالو (`Profiles.nextInSeries`)، ولكن كيبقى عندو `slot` ديال اللي قبلو، باش الزر ديالو فالـ taskbar والزر المثبّت يبقاو هوما هوما.
- **الدروع**: `session.webRequest.onBeforeRequest` كيحجب الملفات ديال المتتبعين، و`onBeforeSendHeaders` كيصلّح `Sec-CH-UA`. الـ HTTPS والروابط النقية كيتطبقو قبل كل تنقل.
- **القوائم**: القوائم ⋯ و👤 و🛡 مرسومين فصفحة شفافة (`renderer/menu.html`) كتغطي النافذة كاملة (`WebContentsView`) غير ملي تكون شي قائمة محلولة. الـ main process كيصيفط ليها شنو فيها والبلاصة ديال الزر (`noor:menu`، `main/menus.js`)، وكيتسنى شنو تختار (`menu:choose`)؛ الـ functions ديال القائمة كيبقاو فالـ main process. الأيقونات (`renderer/icons.js`) خطوط SVG بلون النص. قائمة الكليك اليمين باقية ديال Windows.

## الفرق مع تطبيق iPhone 📱

- ما كاينش «وضع iPad» ولا user agent عشوائي فـ Noor: على PC، المواقع كتشوف Chrome على Windows (أحسن تمويه هو اللي كيشبه أغلب الناس)؛ وفـ Noor iPhone كتشوف iPhone ولا iPad (كل بروفايل واش اختاريتي).
- زادت حماية **Processor & Memory** (`hardwareConcurrency`/`deviceMemory`)، اللي Safari ما كيعطيهاش على iPhone.
- الإضافات كاينين (من Chrome Web Store ولا من ملف)، ولكن ما كيخدموش فالـ onglets الخاصة. بلا استيراد cookies فهاد النسخة.

## الملفات 📁

| الملف | شنو كيدير |
|---|---|
| `main/main.js` | التشغيل: الـ sessions، الـ protocol `noor://`، حجب المتتبعين، الـ headers، الـ IPC |
| `main/tabs.js` | نافذة بروفايل: الـ onglets، الجلسة الجديدة، حالة الشريط |
| `main/windows.js` | النوافذ: نافذة لكل بروفايل، اللي قدام، الزر ديالها فالـ taskbar، البروفايلات اللي كيتصاوبو، كيتمسحو ولا كيتعوّضو ملي يتسدو، والـ onglets المخفيين ديال جمع الكوكيز |
| `main/profile-icon.js` | الأيقونة ديال كل بروفايل: السمية، اللون، وملف `.ico` |
| `main/fingerprint.js` | أنواع الحماية، البذور لكل بروفايل، الشاشات والـ hardware |
| `main/gpus.js`, `scripts/parts/gpu.js` | WebGL Vendor & Renderer ديال Noor: الكارتات اللي كيختار منهم كل بروفيل، وكيفاش كيبانو فـ WebGL وWebGPU |
| `main/shields.js` | الدروع لكل موقع، قواعد المتتبعين، HTTPS، الروابط النقية، الإحصائيات |
| `main/useragent.js` | الـ user agent ديال Chrome والـ brands |
| `main/profiles.js`, `main/history.js`, `main/bookmarks.js`, `main/store.js` | البروفايلات، السجل، المفضلة، الإعدادات |
| `main/warmup.js` | جمع الكوكيز: المواقع حسب المنطقة، المواقع ديالك والإعدادات المحفوظة، الزيارات فـ onglet مخفي، البانرات، الروابط اللي كيتبعها واللي كيتجنبها |
| `main/cookies.js`, `renderer/cookies.html` | صفحة الكوكيز: التجميع حسب الموقع، الحذف، والحفظ بصيغة `cookies.txt` ولا JSON |
| `main/menus.js`, `main/address.js` | القوائم والاختصارات، وشنو كيتحل ملي تكتب فشريط العنوان |
| `main/headers.js` | الترتيب ديال الـ headers بحال Chrome، لكل نوع ديال الطلبات |
| `main/timezone.js` | المنطقة الزمنية ديال الـ IP: كيشوف الـ IP كل 30 ثانية وكيجيب المنطقة ملي كيتبدل |
| `main/fonts.js`, `rules/windows-fonts.json`, `rules/font-pool.json`, `scripts/parts/fonts.js` | الخطوط: ديال كل Windows، اللي كيختار كل بروفيل (Office، اللغات، خطوط معروفة…) وكيفاش كيترسمو، القائمة ديال خطوط الـ PC (كتتقرا وكتتحفظ)، والتخبية ديال الخطوط الأخرى فالصفحات والـ workers |
| `main/quota.js` | البلاصة (storage quota) اللي كيعطيها Chrome لموقع: الخاوي فالديسك، حتى 60% منو؛ و60% ملي الديسك تقريباً عامر |
| `renderer/menu.html`, `renderer/menu.js`, `renderer/menu.css` | القوائم المرسومة بحال Chrome: الأيقونات، الاختصارات، القوائم الفرعية، الـ Zoom، الـ switches، الكلافيي |
| `renderer/icons.js` | الأيقونات الصغيرة ديال القوائم والإعدادات |
| `scripts/preload.js`, `scripts/protect.js` | الحماية المحقونة فالصفحات (مولّدين من `FingerprintProtection.swift` ديال iPhone بـ `tools/extract_from_ios.py`) |
| `scripts/parts/chrome.js` | الجزء الخاص بـ Chromium: `userAgentData`، `chrome.app/csi/loadTimes`، الأذونات، الأصوات، Widevine، Web Share، والبلاصة (quota) ملي البيانات فالذاكرة |
| `main/iphone.js` | Noor iPhone: الـ iPhones والـ iPads، الـ user agent والـ headers ديال Safari، الشاشة اللي كيوريها Chromium |
| `main/android.js` | Noor Android: التيليفونات والتابليتات، الـ user agent والـ client hints ديال Chrome على Android، الشاشة اللي كيوريها Chromium |
| `main/mobile.js` | شنو كيتشاركو Noor iPhone وNoor Android: جهاز لكل بروفايل، الأنواع ديالو، السمية ديال البرنامج |
| `scripts/parts/iphone.js`, `scripts/parts/iphone-surface.js`, `scripts/parts/iphone-fonts.js` | شنو كتشوف الصفحة فـ Noor iPhone: اللي عند Safari واللي ماعندوش (وفين كيختلف الـ iPad)، الخطوط |
| `scripts/parts/android.js`, `scripts/parts/android-surface.js`, `scripts/parts/android-fonts.js` | شنو كتشوف الصفحة فـ Noor Android: الـ platform، الـ GPU، الأصوات، الخطوط، واللي ماعندوش Chrome على Android (`tools/android_surface.js` كيولّد القائمة من البيانات ديال MDN) |
| `main/extensions.js`, `main/extension-bridge.js` | الإضافات، والقنطرة اللي كتعطي الـ background ديالها الـ API (Electron ما كيخدّمش preload فالـ service worker ديال إضافة) |
| `renderer/` | الشريط، صفحة البداية، الإعدادات (بحال Chrome: الأقسام، البحث)، المكتبة، صفحة الخطأ |
| `rules/trackers.json` | المتتبعين المحجوبين (نفس قائمة iPhone) |
| `test/` | tests ديال Node (`npm test`) |
| `tools/smoke-electron.js` | كيشغّل التطبيق بصح وكيتأكد من الأساسيات (Playwright) |
| `tools/smoke-iphone.js` | كيشغّل Noor iPhone بحال مستخدم وكيتأكد أن الصفحة، الـ frames، الـ workers والنوافذ كيشوفو iPhone |
| `tools/smoke-android.js` | كيشغّل Noor Android بحال مستخدم وكيتأكد أن الصفحة، الـ frames، الـ workers، النوافذ والطلبات كيشوفو Chrome على تيليفون ولا تابليت Android |
| `tools/smoke-warmup.js` | كيجرّب جمع الكوكيز على مواقع محلية: الكوكيز، البانر، السكرول، المقالات، المواقع ديالك، البروفايل الجديد، صفحة الكوكيز، وشنو ما خاصوش يدير |
| `tools/smoke-windows.js` | كيجرّب النوافذ: نافذة لكل بروفايل، الأيقونة والزر ديالها، الكوكيز بوحدهم، التعويض ملي يتسد، الحذف، والنوافذ اللي كيتحلو من جديد |
| `tools/smoke-menu.js` | كيجرّب القوائم (البلاصة، الأيقونات، الاختصارات، الـ Zoom، القوائم الفرعية، Escape والكليك برا) وصفحة الإعدادات (الأقسام، البحث، الـ switches)، وكيصوّرهم |
| `tools/smoke-fonts.js` | كيجرّب الخطوط: Noor كيقرا خطوط الـ PC، كل بروفيل كيبيّن خطوط ديالو (المصاوبين كيتلقاو من أول سطر بلا ما يبان التحميل)، الخطوط الأخرى ديال الـ PC ما كيتلقاوش (العرض، canvas، worker، `local()`، `document.fonts`)، New كيبدّلهم، والـ web fonts ديال الصفحة كيخدمو |
| `tools/smoke-quota.js` | كيجرّب البلاصة (quota) اللي كتشوف الصفحات ملي «مسح كل شيء عند الخروج» مشعل وملي الديسك تقريباً عامر: الصفحة، الـ workers والطرق القديمة كيشوفو ديال Chrome عادي، والـ onglet الخاص ديال Incognito |
| `tools/build-iphone.js` | كيبني الـ `.exe` ديال Noor iPhone |
| `tools/build-android.js` | كيبني الـ `.exe` ديال Noor Android |
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
npm run start:android  # كيشغّل Noor Android
npm run dist:android   # كيبني .exe ديال Noor Android
xvfb-run -a node tools/smoke-android.js [phone|tablet]   # test كامل ديال Noor Android
xvfb-run -a node tools/smoke-warmup.js [iphone]   # test ديال جمع الكوكيز
xvfb-run -a node tools/smoke-windows.js [iphone]  # test ديال النوافذ ديال البروفايلات
xvfb-run -a node tools/smoke-menu.js [iphone]     # test ديال القوائم والإعدادات
xvfb-run -a node tools/smoke-quota.js             # test ديال البلاصة (quota): البيانات فالذاكرة، الديسك العامر
xvfb-run -a node tools/smoke-fonts.js             # test ديال الخطوط ديال كل بروفيل
xvfb-run -a node tools/smoke-gpu.js               # test ديال الكارت ديال الرسم ديال كل بروفيل
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
