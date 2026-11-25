# دفتر درس

دفتر کار آنلاین برای یک معلم با چند مدرسه و حساب مستقل دانش‌آموزان. مدیریت کلاس، حضور و غیاب، تقویم شمسی، بانک سؤال، آزمون آنلاین و کارنامه در یک برنامهٔ فارسی و راست‌به‌چپ قرار دارند.

## ابزارهای لازم

- Node.js نسخهٔ ۲۲.۱۳ یا جدیدتر از شاخهٔ ۲۲، یا شاخهٔ ۲۴
- npm و PostgreSQL ۱۶ یا جدیدتر با پایگاه دادهٔ خالی
- Chromium برای آزمون مرورگر

پروژه از Next.js App Router، React، TypeScript، Tailwind، کامپوننت Button با ساختار shadcn/ui، Drizzle روی PostgreSQL، Zod، Recharts، KaTeX و Vazirmatn استفاده می‌کند. فونت به همراه سایت ارائه می‌شود و درخواست خارجی ندارد.

## راه‌اندازی محلی

۱. ZIP را استخراج و ترمینال را در پوشهٔ حاوی `package.json` باز کنید.

۲. وابستگی‌ها و فایل تنظیمات را آماده کنید.

```bash
npm ci
cp .env.example .env.local
```

در PowerShell برای کپی از `Copy-Item .env.example .env.local` استفاده کنید. در `.env.local`، آدرس `DATABASE_URL`، مبدأ `APP_ORIGIN=http://localhost:3000` و مقادیر `ADMIN_LOGIN`، `ADMIN_NAME` و `ADMIN_PASSWORD` را وارد کنید. رمز حداقل ۱۴ نویسه باشد. نام کاربری از حروف لاتین، عدد و علامت‌های مجاز استفاده می‌کند.

۳. جدول‌ها و حساب معلم را بسازید.

```bash
npm run db:migrate
npm run admin:create
npm run dev
```

۴. [http://localhost:3000](http://localhost:3000) را باز کنید. پس از ساخت حساب، مقادیر اولیهٔ ادمین را از فایل تنظیمات حذف کنید. برای بازیابی رمز معلم، مقادیر نام کاربری و رمز تازه را موقتاً تنظیم کنید و `npm run admin:reset` را در ترمینال مورد اعتماد اجرا کنید. این عملیات نشست‌های معلم را می‌بندد.

## آزمون و ساخت

```bash
npm run typecheck
npm test
npm run build
```

برای آزمون یکپارچگی و مرورگر از پایگاه دادهٔ آزمایشی جدا استفاده کنید. آماده‌سازی و متغیرهای لازم در [گزارش آزمون](TEST_REPORT.md) آمده‌اند.

## راهنماها

- [استقرار روی Vercel](DEPLOYMENT.md)
- [راهنمای معلم و دانش‌آموز](USER_GUIDE.md)
- [معماری](ARCHITECTURE.md)
- [پایگاه داده و بازیابی](DATABASE.md)
- [امنیت و حریم خصوصی](SECURITY.md)
- [گزارش آزمون](TEST_REPORT.md)
