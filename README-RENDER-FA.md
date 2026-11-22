# استقرار ذهن برتر روی Render

این شاخه (migrate/render) یک آداپتور Node.js برای اجرای رابط و API برنامه روی Render اضافه می‌کند. شاخه اصلی main دست‌نخورده می‌ماند.

## تنظیم سرویس در Render

- نوع سرویس: Web Service
- مخزن: rezamadadi3c-blip/zehn-bartar-reza
- شاخه: migrate/render
- Root Directory: خالی
- Build Command: npm install
- Start Command: npm start
- Runtime: Node.js 20 یا جدیدتر

Render مقدار PORT را خودکار تنظیم می‌کند.

## متغیرهای محیطی

در بخش Environment سرویس، فقط کلیدهایی را که واقعاً دارید اضافه کنید:

- GEMINI_API_KEY: برای گفت‌وگو و تحلیل تصویر با Gemini.
- GROQ_API_KEY: جایگزین گفت‌وگو و تبدیل فایل صوتی به متن.
- BRAVE_SEARCH_API_KEY: جست‌وجوی وب با Brave (اختیاری).
- TAVILY_API_KEY: جست‌وجوی وب با Tavily (اختیاری).

کلیدها را در GitHub، فایل‌های پروژه یا گفت‌وگو قرار ندهید؛ فقط در Environment سرویس Render ثبت کنید.

## قابلیت‌ها و محدودیت‌ها

- رابط فارسی از پوشه public سرو می‌شود.
- مسیرهای /api/* به کد موجود در src/worker.js هدایت می‌شوند.
- /api/health برای بررسی سلامت سرور در دسترس است.
- در این استقرار، binding اختصاصی Cloudflare Workers AI وجود ندارد.
- تولید تصویر با FLUX که به Cloudflare Workers AI وابسته است، در Render فعال نیست.
- سایر قابلیت‌ها به کلیدهای محیطی و سهمیه ارائه‌دهنده مربوطه وابسته‌اند.
- تاریخچه همچنان در مرورگر همان دستگاه نگهداری می‌شود.

پس از انتشار، این آدرس را آزمایش کنید: https://YOUR-SERVICE.onrender.com/api/health
