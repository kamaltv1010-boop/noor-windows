---
name: noor-checks
description: تشغيل اختبارات Noor للخصوصية والاستقرار (Canvas وWebGL وAudio والخطوط وWebRTC والـ workers وعزل البروفايلات والثبات بعد إعادة التشغيل والنسخة المبنية والمثبّت) على Linux أو على Windows في CI، وقراءة تقريرها العربي. Use when testing Noor (Windows, iPhone, Android builds) for privacy leaks or stability, after a fix, or before a numbered build.
---

# اختبارات Noor: الخصوصية والاستقرار

هذه **مهارة** (تعليمات): متى تُشغَّل الاختبارات وكيف تُقرأ نتائجها.
**الأدوات** التي تعتمد عليها موجودة في المشروع نفسه:

- `tools/run-checks.js`: يشغّل حزمة اختبارات، كل اختبار في عملية مستقلة بحد زمني،
  ويكتب تقريراً عربياً (`report.md` و`report.json`) فيه لكل اختبار: إصدار النظام،
  إصدار Noor، الأمر، النتيجة، المدة، مكان السجل، والعمليات المتبقية بعده.
- `tools/checks/*.json`: الحزم (`windows-built`، `windows-variants`،
  `windows-dev-noor`، `windows-dev-mobile`).
- `tools/smoke-*.js` و`tools/probe-*.js`: الاختبارات نفسها (Playwright على الكود،
  أو تشغيل النسخة المبنية كما يشغّلها المستخدم).
- `.github/workflows/windows-checks.yml`: نفس الحزم على Windows (آلة GitHub
  الافتراضية `windows-latest`).

## المتطلبات

- Node 22 و`npm ci` في مجلد المشروع.
- Playwright 1.63 لاختبارات الكود (`npm install --no-save playwright@1.63.0`؛
  لا يحتاج متصفحاً خاصاً به).
- على Linux: `xvfb-run` (شاشة وهمية). على Windows: لا شيء إضافي.
- للنسخة المبنية: `npx electron-builder --linux dir` (Linux) أو `npm run dist`
  (Windows).

## التشغيل على Linux

```bash
# الكود أثناء التطوير (مثال: حزمة Noor):
xvfb-run -a -s "-screen 0 1920x1080x24" node tools/run-checks.js tools/checks/windows-dev-noor.json --out /tmp/noor-checks
# النسخة المبنية:
npx electron-builder --linux dir --x64 --publish never -c.directories.output=/tmp/noor-linux-dist
NOOR_EXE=/tmp/noor-linux-dist/linux-unpacked/noor-browser xvfb-run -a node tools/run-checks.js tools/checks/windows-built.json --out /tmp/noor-built --only fuses,built-app,cookie-store,workers,debug-port
# شاشة قصيرة مثل حاسوب محمول (768 ناقص شريط المهام):
xvfb-run -a -s "-screen 0 1024x720x24" node tools/smoke-android.js phone 3
```

## التشغيل على Windows

1. ارفع الفرع إلى `windows-checks-*` (لا يُصدر نسخة؛ نسخة مرقّمة تأتي فقط من `main`).
2. أربع مهام: Noor المبني والمثبَّت، iPhone وAndroid المبنيان، كود Noor (حزمتان).
3. اقرأ سجل كل مهمة (`mcp__github__get_job_logs`، أو
   `https://api.github.com/repos/<owner>/<repo>/actions/jobs/<id>/logs`):
   الجدول العربي في آخر السجل، وآخر سطور كل اختبار فاشل داخل مجموعة
   `<اسم الاختبار>: آخر ما كتبه`. ملفات الـ artifact قد لا تكون متاحة من بيئة العمل.

## قراءة النتائج

- رمز الخروج 0 = نجح، 1 = وجد مشكلة، غير ذلك = تعذّر التشغيل (بيئة، وقت).
- `"expect": "problem"` = مشكلة معروفة يُثبتها الاختبار (مثل الكوكيز بلا تشفير
  في Electron العادي، مرجع "قبل الإصلاح").
- **لا تعتبر النتيجة إصلاحاً قبل أن تُرى على المنصة المعنية**: نتيجة Linux تُقال
  "على Linux"؛ نتيجة CI تُقال "على آلة Windows افتراضية بلا بطاقة رسوميات"،
  وليست جهاز مستخدم.
- فرّق بين خلل في Noor وخلل في طريقة الاختبار: أعد التشغيل مع إيقاف الحماية
  (`off`) لترى سلوك Chromium نفسه، كما في مشكلة Arial في الـ shared workers.
- اختبار فشل مرة واحدة: أعد تشغيله وحده (`--only <اسم>`) قبل الحكم.
- الإغلاق على Windows: `CloseMainWindow` يغلق نافذة واحدة فقط (الأمامية)، وبقاء
  نوافذ البروفايلات الأخرى صحيح. الإغلاق كما يفعل المستخدم: WM_CLOSE لكل نافذة
  (`probe-built-app.js`)؛ و`tools/smoke-close.js` يقارن: واحدة بعد الأخرى،
  الاثنتان معاً، `taskkill`، ويكتب كل حدث إغلاق بوقته (`events` في تقريره).
- نافذة لا يمكن حسابها إلا بحدود Windows (حافة غير مرئية حول النافذة): حاكِ
  الحدود على Linux (مثال: `popupPlaceFramed` في `smoke-extensions.js`)، ثم تحقق
  على Windows.
- توقيت يختلف على حاسوب أبطأ (Windows في CI): أضف تأخيراً مصطنعاً في الاختبار
  لتعيد إنتاجه على Linux (مثال: عدّ الكوكيز في `smoke-warmup.js`).

## بعد الإصلاح

أضف اختباراً يمنع عودة المشكلة (في `tools/` أو `test/`)، وسجّل قبل/بعد في
`PROGRESS.md` والتغيير في `CHANGELOG.md`.
