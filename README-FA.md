# ذهن برتر — نسخه Cloudflare Workers

این پروژه از رابط فارسی در پوشه public و Worker در src استفاده می‌کند. فایل wrangler.toml مسیر فایل‌های استاتیک را صریحاً مشخص می‌کند تا خطای تشخیص پوشه فایل‌های سایت رفع شود.

## تنظیم Cloudflare
- Root directory: /
- Build command: خالی
- Deploy command: npx wrangler deploy

پس از ساخت Worker، در Settings > Variables and Secrets این موارد را اضافه کنید:
- AI_API_KEY به‌صورت Secret
- AI_API_URL اختیاری؛ پیش‌فرض Groq compatible endpoint
- AI_MODEL اختیاری؛ پیش‌فرض llama-3.3-70b-versatile

کلید API را در GitHub، فایل‌های عمومی یا چت قرار ندهید. این نسخه چت متنی دارد؛ قابلیت صدا، تصویر، تحلیل فایل و APK هنوز در آن پیاده‌سازی نشده است. استفاده از مدل ابری ممکن است محدودیت یا هزینه داشته باشد.
