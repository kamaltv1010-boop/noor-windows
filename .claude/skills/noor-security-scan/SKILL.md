---
name: noor-security-scan
description: فحص الأسرار المكشوفة (secretlint على الملفات وعلى تاريخ git كاملاً، مع اختبار ضبط يثبت أن الفاحص يعمل) والتبعيات ذات الثغرات المعروفة (npm audit مع فصل ما يُشحن مع التطبيق عن أدوات البناء) وإعدادات الأمان في ملف الـ exe المبني (fuses)، لمشاريع Noor وAmir. Use for secret scanning, dependency vulnerability checks, or a security check before a numbered build.
---

# فحص الأسرار والتبعيات وإعدادات الأمان

هذه **مهارة** (تعليمات وطريقة قراءة)، والأدوات التي تشغّلها:

| الأداة | المصدر | ما تفعله |
|---|---|---|
| `secretlint` 13.x مع `@secretlint/secretlint-rule-preset-recommend` | npm، github.com/secretlint/secretlint، رخصة MIT | يبحث عن مفاتيح وتوكنات وكلمات سر في النصوص |
| `npm audit` | مدمج في npm، قاعدة GitHub Advisory | الثغرات المعروفة في التبعيات |
| `tools/check-fuses.js` | في المشروع، يعتمد على `@electron/fuses` | يقرأ إعدادات الأمان من ملف التطبيق المبني |

## التثبيت (مرة واحدة، خارج المشروع)

```bash
mkdir -p /tmp/tools/secretlint && cd /tmp/tools/secretlint
npm init -y && npm install --no-audit --no-fund secretlint @secretlint/secretlint-rule-preset-recommend
echo '{ "rules": [ { "id": "@secretlint/secretlint-rule-preset-recommend" } ] }' > .secretlintrc.json
```

(Gitleaks أداة بديلة جيدة، لكن تنزيلها من GitHub قد يُمنع في بيئات مقيّدة.)

## 1. اختبار الضبط أولاً

فاحص لا يجد شيئاً لا يعني شيئاً إن لم يثبت أنه يكتشف سراً معروفاً:

```bash
S=/tmp/tools/secretlint; mkdir -p /tmp/sl-control && cd /tmp/sl-control
printf 'const token = "ghp_%s";\n' "$(head -c 200 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 36)" > fake.js
$S/node_modules/.bin/secretlint --secretlintrc $S/.secretlintrc.json fake.js; echo "exit $?"   # يجب 1
```

## 2. الملفات الحالية وتاريخ git كاملاً

```bash
S=/tmp/tools/secretlint; R=<مجلد المشروع>
git -C "$R" ls-files | grep -v -e '^node_modules/' -e 'package-lock.json' -e '\.png$' -e '\.ico$' > /tmp/files.txt
(cd "$R" && xargs -a /tmp/files.txt -d '\n' $S/node_modules/.bin/secretlint --secretlintrc $S/.secretlintrc.json); echo "files exit $?"
git -C "$R" log -p --all --no-color -- . ':(exclude)package-lock.json' > /tmp/history.patch
$S/node_modules/.bin/secretlint --secretlintrc $S/.secretlintrc.json /tmp/history.patch; echo "history exit $?"
```

رمز الخروج 0 = لا سرّ. أي نتيجة: تحقّق منها يدوياً (مثال أو قيمة اختبار؟)،
وإن كانت حقيقية فالسر يُلغى ويُستبدل من مصدره، لا يكفي حذفه من الكود.

## 3. التبعيات

```bash
npm audit --omit=dev    # ما يُشحن مع Noor: يجب 0
npm audit --json        # كل شيء، مع أدوات البناء
```

لكل ثغرة: هل الكود المصاب يعمل في التطبيق المشحون أم وقت البناء فقط؟ هل
المدخل الخبيث ممكن فعلاً في Noor؟ لا تُعَدّ ثغرةً منطبقةً قبل هذا التحقق.

## 4. إعدادات ملف التطبيق المبني

```bash
node tools/check-fuses.js dist/win-unpacked/Noor.exe
```

يجب: تشفير الكوكيز مفعّل؛ `runAsNode` و`NODE_OPTIONS` و`--inspect` معطّلة.

## التوثيق

سجّل في `PROGRESS.md`: الأداة وإصدارها، الأمر، رمز الخروج، النتيجة، وما
اعتُبر إنذاراً كاذباً ولماذا.
