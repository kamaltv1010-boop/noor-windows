# CHANGELOG

Numbered builds are on GitHub Releases (`1.0.<build>`); each holds Noor,
Noor iPhone and Noor Android for Windows (installer and portable `.exe`).

## 1.0.47

- **أمان: موقع لا يصل إلى خدمات حاسوبك أو شبكتك المنزلية باسم يشير إليها**: كان
  Noor يمنع صفحة الموقع من طلب عنوان مثل `127.0.0.1` أو `192.168.1.1` (برنامج على
  حاسوبك، صفحة الراوتر، الطابعة). لكن الموقع كان يستطيع أن يطلب **اسماً** يشير إلى
  هذه العناوين، وهي أسماء موجودة فعلاً في الإنترنت. وكان يستطيع أيضاً أن يغيّر ما
  يشير إليه اسمه بعد تحميل صفحته (هجوم «إعادة ربط DNS»)، فيقرأ ردود برنامج على
  حاسوبك كأنها من موقعه. الآن يحلّ Noor الاسم قبل الطلب، ويمنعه إن أدّى إلى حاسوبك
  أو شبكتك. ويعرف مكان كل صفحة من العنوان الذي جاءت منه فعلاً، لا من اسمها. اختبار
  على Windows يجرّب تسع طرق ويتأكد أن كلها ممنوعة: fetch بالعنوان وبالاسم، وصورة،
  وإطار، وWebSocket، وbeacon، وworker، واسم الموقع نفسه بعد إعادة ربطه.
- **أمان (تحصين): صفحة من ملف على حاسوبك لا تقرأ ملفاته الأخرى**: يعطي Electron
  الصفحات المفتوحة من ملف محلي (`file://`) صلاحية لا يعطيها Chrome، وهي قراءة أي ملف
  آخر على الحاسوب، ثم إرساله إلى أي مكان. لم نجد طريقاً يفتح به موقعٌ أو ملفٌ صفحةً
  كهذه في Noor: شريط العنوان يعامل `file:` كبحث، والتشغيل لا يفتح إلا روابط http،
  والسحب والإفلات لا يفتح الملف. لكن هذه الصلاحية أُطفئت الآن في ملفات exe الثلاثة
  (fuse `GrantFileProtocolExtraPrivileges`)، فتُعامَل هذه الصفحات كما في Chrome. اختبار
  النسخة المبنية يفتح صفحة ملف في تبويب ويتأكد أنها لا تقرأ ملفاً آخر. قبل الإطفاء
  قرأته بثلاث طرق.
- **خصوصية: طريق جديد لقراءة رسم canvas الحقيقي أُغلق (VideoFrame)**: الحماية تضيف
  تغييراً صغيراً لا يُرى إلى ما يقرؤه الموقع من رسومه، حتى لا يصير الرسم بصمة لحاسوبك.
  لكن واجهة `VideoFrame` كانت تقرأ الرسم الحقيقي متجاوزة الحماية، سواء أُنشئت من
  canvas أو من OffscreenCanvas أو من صورة نقطية. الآن تُصنع من النسخة المحمية، فتعطي
  ما تعطيه الطرق الأخرى، والواجهة نفسها تبقى كواجهة المتصفح. ينطبق ذلك على Noor
  وNoor iPhone وNoor Android. والإصلاح نفسه في تطبيق iPhone (Amir) يصل في نسخته
  القادمة.
- **اختبارات أمان جديدة**: أن كود أي موقع لا يصل إلى Node أو Electron أو أوامر Noor
  في عشرة أماكن: الصفحة، والإطارات بأنواعها، وإطار موقع آخر، والنوافذ التي تفتحها
  الصفحة، والـ workers الثلاثة. وأن صفحة تستبدل دوال JavaScript الأساسية لا تلتقط
  بها وسيلة اتصال Noor الداخلية (IPC) حين يرسل Noor رسالة إلى صفحتها. وأن موقعاً لا
  يصل إلى خدمات حاسوبك. وأن ما تنزّله من موقع يحمل علامة «من الإنترنت» (Mark of the
  Web)، التي يحذّرك بها Windows وOffice قبل فتح الملف. يكتبها Chromium نفسه، وقد تحقّقنا
  من ذلك على Windows، والاختبار يتأكد أنها تبقى.
- **اختبارات خصوصية جديدة**: ما يقوله كل طلب للخادم (User-Agent وClient Hints) في
  الصفحة والصورة والسكربت وfetch والإطار والـ workers الثلاثة يطابق ما تقوله الصفحة.
  نسختا iPhone وAndroid لا تذكران Windows في أي طلب، وNoor iPhone لا يرسل Client
  Hints أصلاً لأن Safari لا يرسلها. واختبار يجرّب كل طرق قراءة canvas (13 طريقة في
  الصفحة وطريقتان في الـ worker)، ويتأكد أن لا طريقة منها تعطي الرسم الحقيقي.
- **اختبار لما يرسمه WebGL نفسه**: يرسم بـ WebGL وWebGL2 تدرّجاً يختلف من بطاقة رسوميات
  إلى أخرى، ثم يقرؤه بـ 12 طريقة محمية: readPixels للرسم كله ولجزء منه ولإطار خاص،
  وtoDataURL، وtoBlob، والرسم على canvas عادي، وصورة نقطية، وVideoFrame، ورفعه إلى
  WebGL آخر، وطريقتان في الـ worker. لا طريقة منها تعطي الرسم الحقيقي. **حدّ معروف**:
  طريقان يعطيان الرسم الحقيقي ولم نضف إليهما تشويشاً عن قصد. الأول قراءة WebGL2 إلى
  ذاكرة وسيطة (`PIXEL_PACK_BUFFER`). والثاني قراءة إطار من الأعداد العشرية. السبب أن
  مواقع الذكاء الاصطناعي التي تحسب على بطاقة الرسوميات تقرأ نتائجها بهما، مثل
  TensorFlow.js وإزالة الخلفية في محررات الصور، وأي تشويش يفسد نتائجها. سكربتات
  البصمة الشائعة لا تستعمل هذين الطريقين، لكن موقعاً يستهدف Noor بعينه يستطيع ذلك.

## 1.0.46

- **أمان: المواقع لا تصل إلى صفحات Noor نفسها**: صفحات الإعدادات والكوكيز والمكتبة
  وصفحة البداية تملك أوامر التطبيق كلها (الإعدادات، البروفايلات، تصدير الكوكيز،
  الإضافات). كان موقع يستطيع أن يذهب بتبويبه إليها: بالانتقال، أو برابط، أو بنافذة
  تُفتح بنقرتك، أو بـ Ctrl+نقر، أو بالزر الأوسط، أو بتحويل من خادمه. لم نجد طريقاً
  يستغل ذلك، لكنه كان باباً مفتوحاً. الآن تُفتح هذه الصفحات من Noor نفسه فقط (شريط
  العنوان، القوائم، وروابطها فيما بينها)، كما يمنع Chrome المواقع من صفحات chrome://.
- **أمان: موقع لا يضع صفحات Noor في إطار داخل صفحته (خداع النقر)**: كان موقع يستطيع
  أن يعرض صفحة إعدادات Noor في إطار مخفي تحت أزراره، فتنقر أنت على ما تظنه زر الموقع
  وهو في الحقيقة زر في إعدادات Noor. وُجد هذا باختبار على Windows. الآن تُمنع ثلاث
  مرات: لا يُفتح إطار لصفحة Noor من صفحة موقع، وصفحات Noor نفسها ترفض أن تُعرض داخل
  إطار، ولا تجيب أوامر التطبيق صفحةً داخل إطار موقع.
- **خصوصية: إطار من الموقع نفسه لم يعد يكشف خطوط حاسوبك الحقيقية**: الحماية تُخفي عن
  المواقع خطوط حاسوبك التي ليست في البروفايل. لكن إطاراً (iframe) من الموقع نفسه
  كان يرى خطوط حاسوبك كلها، كأن الحماية معطّلة. السبب أن Chromium يُبقي نافذة الإطار
  الفارغة الأولى للصفحة التي يحمّلها، فكانت الحماية تضيف خطوطها إلى المستند الفارغ
  القديم لا إلى صفحة الإطار. الآن يُعاد ما يخص المستند لكل مستند جديد في النافذة نفسها.
  ينطبق ذلك على الإطار بعنوان، وعلى إطار srcdoc، وعلى الإطار الذي يضيفه سكربت. وينطبق
  على Noor وNoor iPhone وNoor Android.
- **خصوصية: Noor iPhone وNoor Android لا يكشفان خطوطاً ثبّتّها على حاسوبك**: كانت
  النسختان تُخفيان قائمة ثابتة من خطوط Windows وبرامجه (Office وAdobe وغيرهما). لكن
  أي خط آخر ثبّتّه بنفسك كان يظهر للمواقع، وهو الأكثر تمييزاً لحاسوبك، ويظهر نفسه في
  كل البروفايلات. من أمثلته خطوط المطوّرين وخطوط Google وCascadia في Windows 11. الآن
  تسألان، مثل Noor، عن قائمة خطوط حاسوبك، وتخفيان كل خط لا يملكه iPhone أو Android.
- **توافق: حفظ صورة من canvas داخل إطار من الموقع نفسه عاد يعمل**: للسبب نفسه كان
  `canvas.toBlob` في هذه الإطارات لا يعيد النتيجة أبداً، فتتوقف المواقع التي تحفظ أو
  ترفع صورة مرسومة (محررات الصور، القص، التوقيع) داخل إطار.
- **تشغيل Noor مرة ثانية أثناء بدئه لم يعد يُضيع الرابط**: نقرة ثانية على الأيقونة،
  أو زر بروفايل مثبّت في شريط المهام، أو رابط من برنامج آخر، في الثواني الأولى من
  تشغيل Noor، كانت تضيع. الآن تُحفظ وتُفتح حين يجهز.
- **اختبارات أمان جديدة**: أن موقعاً لا يصل إلى صفحات Noor (تسع طرق، منها الإطار)؛
  أن موقعاً لا يشغّل برنامجاً على الحاسوب عبر رابط ببروتوكول آخر (مثل `ms-msdt:` على
  Windows)؛ أن كود موقع في عنوانه أو كوكيزه لا يعمل في صفحات Noor؛ وأن موقعاً لا يقرأ
  ملفاً من حاسوبك بأي طريقة (fetch، إطار، صورة، انتقال، رابط تنقره، أو الخروج من مجلد
  صفحات Noor).
- **اختبارات خصوصية وتوافق جديدة**: عزل البروفايلات داخل الإطارات والـ workers أيضاً؛
  أن اسم بطاقة الرسوميات الحقيقية لا يظهر في الصفحة ولا في أي worker؛ أن إطارات
  الموقع نفسه لا تُظهر خطوطاً تخفيها الصفحة؛ وأن الحماية لا تكسر نحو ستين واجهة تستعملها
  المواقع (canvas وWebGL والصوت والخطوط والوقت واللغة والشاشة وWebRTC…) في الصفحة
  والإطار والـ worker، ولا تشوّه الرسم.

## 1.0.45

- **روابط مثبّتة (Pin) جديدة**: "Pin this page" في قائمة ⋯ تثبّت الصفحة المفتوحة،
  و"Pin Link" في قائمة الزر الأيمن تثبّت أي رابط. تظهر في صف "Pinned" في صفحة
  البداية فوق المفضلة، ويُلغى تثبيت أي منها بـ ✕. الرابط المثبّت يُحفظ بلا رموز
  التتبّع (مثل `utm_source` و`fbclid`)، ويُفتح تماماً كما لو كتبت العنوان بنفسك.
- **فتح المفضلة أو الرابط المثبّت = كتابة العنوان**: قِسنا ما يصل إلى الموقع في كل
  طريقة (كتابة العنوان في الشريط أو في صفحة البداية، مربع المفضلة، المفضلة في
  المكتبة، الرابط المثبّت): نفس الترويسات (`Sec-Fetch-Site: none`،
  `Sec-Fetch-User: ?1`، بلا `Referer`) ونفس ما تقرؤه الصفحة، كما في Chrome. ما
  يختلف هو العنوان المحفوظ نفسه فقط: مفضلة حُفظت من صفحة الدخول مثلاً تفتح صفحة
  الدخول بعنوانها الطويل، فثبّت الصفحة الرئيسية للموقع إن أردت فتحها كما تكتبها.
- **المفضلة والروابط المثبّتة تُحفظ كاملة**: كملف الإعدادات، يُكتب ملفاهما كاملاً
  أو لا يُكتبان، فانقطاع الكهرباء أثناء الحفظ لا يُضيعهما.

## 1.0.44

- **Noor لم يعد يتجمّد عند الإغلاق** (النسخ الثلاث): كان أحياناً يعلق ولا يُغلَق
  بعد تغيير إعداد أو إعادة فتح نوافذ البروفايلات، لأن خطأً في الكود كانت تُظهره
  نافذة خطأ توقف البرنامج كله حتى يُضغط OK. أُصلح الخطأ، ونافذة الخطأ لم تعد
  توقف البرنامج. التحقق على Linux: قبل الإصلاح علق 2 من 4 تشغيلات، وبعده 0 من 10.
  وعلى Windows: النسخ الثلاث المبنية تُغلق نوافذها (بروفايلان) واحدة بعد الأخرى
  فيخرج البرنامج وحده، ثم تُفتح من جديد ببروفايلاتها وإعداداتها، بلا أي خطأ.
- **شعار خاص لكل متصفح**: Noor بنفسجي فيه درع، Noor iPhone أزرق فيه iPhone،
  Noor Android أخضر فيه هاتف Android، لتفرّق بينها في شريط المهام وسطح المكتب.
  التحقق على Windows: كل ملف exe يُظهر شعاره هو، مختلفاً عن الآخرَين.
- **صفحة الهاتف تظهر كاملة على الشاشات القصيرة** (Noor iPhone وNoor Android):
  على شاشة ارتفاعها 768 (حاسوب محمول، مع شريط مهام Windows) كانت صفحة الهاتف
  أو الـ iPad تُقصّ من الأسفل؛ الآن تُصغَّر لتظهر كاملة. التحقق على Windows
  (شاشة 1024×768) وعلى Linux (1024×720): نجحت الأجهزة كلها بعد أن فشل الهاتف
  والـ iPad قبل الإصلاح.
- **نافذة الإضافة تحت زرها تماماً على Windows**: كانت نافذة الإضافة المنبثقة
  تظهر يسار زرها بنحو 8 بكسل وأسفل مكانها بمثلها، لأن حدود نافذة Windows تشمل
  حافة غير مرئية. الآن تُحسب من حدود المحتوى. التحقق على Windows.
- **تنبيه واحد حين تبدأ عدة بروفايلات جمع الكوكيز معاً**، حتى على حاسوب أبطأ:
  كان التنبيه ينقسم ("في Farm 1" ثم "في بروفايلين") لأن كل بروفايل يبدأ بعد عدّ
  كوكيزه، وهذا يختلف من بروفايل لآخر. التحقق على Windows وعلى Linux.
- **إيقاف Windows أو إعادة تشغيله أو تسجيل الخروج لا يُضيع صفحاتك**: كان Noor
  يحفظ التبويبات حين تفتحها أو تغلقها فقط، لا حين تنتقل فيها إلى صفحة أخرى،
  وWindows حين يُطفأ لا يترك Noor يحفظ عند الخروج؛ فكان التبويب يعود إلى صفحة
  قديمة. الآن يحفظها بعد ثانية من كل تنقّل، وفوراً حين يُعلمه Windows بنهاية
  الجلسة. وملف الإعدادات (فيه البروفايلات وتبويباتها) صار يُكتب كاملاً أو لا يُكتب،
  فانقطاع الكهرباء أثناء حفظه لا يُضيع البروفايلات.
- **اختبارات على Windows نفسه** (آلة GitHub الافتراضية، Windows Server 2025):
  البناء والتثبيت وأول تشغيل والبروفايلات والإغلاق وإعادة الفتح والكوكيز المشفّرة
  والـ fuses، مع تقرير عربي لكل اختبار. نجحت كلها في النسخ الثلاث: 9 من 9 لـ Noor
  المبني والمثبَّت، 11 من 11 لـ iPhone وAndroid المبنيين، و41 اختباراً على الكود.
- **مهارتان للفحص** داخل المشروع: `noor-checks` (اختبارات الخصوصية والاستقرار)
  و`noor-security-scan` (فحص الأسرار المكشوفة والتبعيات): لا سرّ في الملفات ولا
  في تاريخ git، و0 ثغرات في المكتبات التي تُشحن مع Noor.

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
