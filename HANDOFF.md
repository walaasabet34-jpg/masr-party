# HANDOFF — تحويل «سهرة طلقة» لنقط بالكامل (من غير شرب)

> حالة فعلية للكود وقت الكتابة. مفيش أسرار هنا.

## المطلوب
شيل الشرب نهائيًا (الواجهة، المحتوى، القواعد، النتائج، الإعدادات، الـhandlers)، وخلي النقط النظام الوحيد.
النشر على خدمة Render الحالية `masr-party` (خطة مجانية، نشر تلقائي من `main`)، والتحقق على https://masr-party.onrender.com.

## قواعد النقط الجديدة
- نقط الجولة زي ما هي في كل لعبة (`points` اللي بيرجعها `resolve`): الأول ٣، التاني ٢، الباقي ١، الأخير صفر؛ المبارزات ٢/١/٠؛ وقواعد خاصة (الدخيل، فشر، التلات كبايات، الديب الوحداني، الكراسي).
- خصم −١ مع سبب (`deduct: { pid: { n, why } }`) بدل «أسوأ نتيجة» القديمة: صاحب القنبلة، الدخيل لو اتمسك، الأكتر أصوات لوحده، الأبطأ في المبارزة/ضرب بدري، ولا صوت في قفشة/خربشة أو ورقة فاضية، النصّاب اللي محدش اتضحك عليه.
- الروليت: لاعب + كارت (+٣/+٢/−٢/−٣) بيتختاروا في `setup` على السيرفر.
- المهمات: +٢ للي عملها، −١ للهدف بعد تأكيده (التأكيد من الهدف اتساب لأنه تحكيم لازم للعبة).
- المركب: صح في جولات ١–٣ = رقم الجولة، ورقة في الهرم = رقم الصف (١–٥)، على المركب كل غلطة −١ والنزول +٣.
- الرصيد ممكن يبقى سالب.
- كل جولة بتتحسب مرة واحدة في `Room.finishGame` في `lastResult.ledger`؛ إعادة الاتصال ما بتلمسش النقط.

## المنجز (في الكود دلوقتي)
- السيرفر: `server/room.js` (ledger، شيل judges/assignments/sideDrinks/noDrinks/sober)، `server/penalty.js` اتمسح،
  كل الألعاب `server/games/*.js` (deduct بدل tier، نصوص القواعد، الروليت الجديدة، الجنيه بدل الشوت)، `server/boat.js` (score بدل sips)،
  المحتوى `server/content/*.js`، `server/index.js` (شيل drink:judge/reassign)، `server/lib/rank.js` (forceLose).
- الواجهة: `client/src/copy.js` اتعاد كتابته، `net.js`، `ui/kit.jsx` (DrinksSwitch اتشال)، `App.jsx`، `screens/Home.jsx`، `screens/Setup.jsx`، `sound.js`.

## المتبقي
1. `client/src/screens/Room.jsx`: شيل JudgeOverlay/DrinkCard/sober/noDrinks/waterBreak؛ statusOf ← results/rules/ready؛ ResultsBlock يعرض ledger؛ BriefingPhone يعرض «كسبت/اتخصم منك» من غير owes؛ NextGameCard من غير dry ويعرض `meta.pointsNote`؛ Ended يرتّب بالنقط.
2. `client/src/screens/Results.jsx` (عمود النقط من ledger)، `client/src/screens/Boat.jsx` (score بدل sips، شيل give/drank)، `client/src/games/chaos.jsx` (كارت الروليت، 🪙 بدل 🥃).
3. الاختبارات `server/test/*.test.js` (flow فيه judge وsips).
4. التوثيق README و docs/MATCHING.md.
5. بناء + اختبارات + تجربة متصفح + commit/push لـ main + متابعة نشر Render + اختبار الموقع المنشور.

## أخطاء معروفة
- الواجهة لسه ما بتتبنيش لحد ما Room/Boat/Results/chaos يتعدّلوا (بتنادي `api.judge` وحقول اتشالت).
