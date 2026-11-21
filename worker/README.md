# اتصال امن هوش مصنوعی ذهن برتر

این Worker واسط امن بین برنامه اندروید و Gemini است. کلید Gemini فقط در Secretهای Cloudflare ذخیره می‌شود و داخل APK قرار نمی‌گیرد.

## پیش‌نیاز
- حساب Cloudflare با امکان ساخت و استقرار Workers
- کلید Gemini API از Google AI Studio (سهمیه و دسترسی رایگان بسته به کشور/حساب متغیر است)
- Node.js و Wrangler برای استقرار، یا محیط ویرایش Cloudflare Workers

## تنظیم Secretها
در تنظیمات Worker این دو Secret را اضافه کنید:
- `GEMINI_API_KEY`: کلید API از Google AI Studio
- `APP_TOKEN`: یک رمز تصادفی طولانی که فقط برنامه و Worker بدانند

متغیر معمولی اختیاری: `GEMINI_MODEL` (پیش‌فرض `gemini-2.5-flash`).

## استقرار با Wrangler
در این پوشه اجرا کنید:
```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put APP_TOKEN
npx wrangler deploy
```

پس از استقرار، آدرس Worker را در تنظیمات برنامه وارد کنید. برنامه درخواست POST را به همان URL ارسال می‌کند و هدر Authorization: Bearer APP_TOKEN لازم است.

## نکته مهم
این پروژه نمی‌تواند به‌جای صاحب حساب، حساب Cloudflare یا Google را ایجاد کند یا Secretهای خصوصی را تنظیم کند. تا زمانی که این دو Secret در Worker تنظیم نشده باشند، پاسخ هوشمند ابری فعال نمی‌شود. هرگز کلیدها را در چت یا در کد برنامه قرار ندهید.