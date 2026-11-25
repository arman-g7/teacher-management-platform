import { test, expect, type Page, type Locator } from '@playwright/test';
import { Client } from 'pg';
import { dayInTehran, jalaliInput, ZONE } from '../../lib/date';

const credentials = {
  login: process.env.E2E_ADMIN_LOGIN ?? 'qa.teacher',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'Local-QA-teacher-1234',
};
const studentPassword = 'Local-QA-student-temp-9876';
const finalPassword = 'Local-QA-student-final-9876';
const unique = Date.now().toString(36);
const school = 'دبیرستان آزمون ' + unique,
  year = 'سال آزمون ' + unique,
  semester = 'نیمسال آزمون ' + unique,
  cls = 'کلاس ' + unique,
  subject = 'شیمی ' + unique,
  examName = 'آزمون شیمی ' + unique,
  studentLogin = 'student.' + unique;
const today = jalaliInput(dayInTehran());
const [y] = today.split('/');
const startYear = y + '/01/01',
  endYear = String(Number(y) + 1) + '/01/15';
const testOrigin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3300';
async function login(page: Page, name: string, password: string) {
  await page.goto('/login');
  await expect(page.locator('form.edit-form')).toHaveAttribute('method', 'post');
  await page.getByLabel('نام کاربری', { exact: true }).fill(name);
  await page.getByLabel('رمز عبور', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ورود به سامانه' }).click();
}
async function save(form: Locator, name = 'ذخیره') {
  await form.getByRole('button', { name, exact: true }).click();
  await expect(form.getByRole('status').filter({ hasText: 'ذخیره شد.' })).toBeVisible();
}
async function open(page: Page, label: string) {
  const summary = page.getByText(label, { exact: true }).filter({ visible: true });
  await summary.click();
  return page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: label }) })
    .first()
    .locator('form');
}
async function select(form: Locator, label: string, text: string) {
  const field = form.getByRole('combobox', { name: label, exact: true });
  const target = field.locator('option').filter({ hasText: text }).first();
  await expect(target).toBeAttached();
  await field.selectOption((await target.getAttribute('value')) ?? '');
}
async function setTime(form: Locator, label: string, dt: Date) {
  await form.getByLabel(label, { exact: true }).fill(jalaliInput(dayInTehran(dt)));
  await form.getByLabel('ساعت ' + label, { exact: true }).fill(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(dt)
  );
}
const go = (page: Page, path: string) => page.goto(path);
async function changeDatabase(query: string, values: unknown[]) {
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  try {
    return await db.query(query, values);
  } finally {
    await db.end();
  }
}

test('teacher and student complete attendance, hybrid exam grading, publication and report', async ({
  page,
  browser,
}) => {
  test.skip(!process.env.TEST_DATABASE_URL, 'Use a disposable PostgreSQL database.');
  await login(page, credentials.login, credentials.password);
  await expect(page.getByText('میز کار معلم')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await go(page, '/schools');
  let form = await open(page, 'افزودن مدرسه');
  await form.getByLabel('نام مدرسه').fill(school);
  await save(form);
  await expect(page.locator('summary').filter({ hasText: school })).toBeVisible();
  form = await open(page, 'افزودن سال تحصیلی');
  await select(form, 'مدرسه', school);
  await form.getByLabel('نام سال').fill(year);
  await form.getByLabel('آغاز سال', { exact: true }).fill(startYear);
  await form.getByLabel('پایان سال', { exact: true }).fill(endYear);
  await save(form);
  form = await open(page, 'افزودن کلاس');
  await select(form, 'سال تحصیلی', year);
  await form.getByLabel('نام کلاس').fill(cls);
  await form.getByLabel('پایه').fill('یازدهم');
  await save(form);
  form = page
    .locator('section.panel')
    .filter({ has: page.getByRole('heading', { name: 'درس‌ها', exact: true }) })
    .locator('form');
  await select(form, 'مدرسه', school);
  await form.getByLabel('نام درس').fill(subject);
  await save(form);

  form = await open(page, 'افزودن نیمسال');
  await select(form, 'سال تحصیلی', year);
  await form.getByLabel('نام نیمسال').fill(semester);
  await form.getByLabel('آغاز نیمسال', { exact: true }).fill(startYear);
  await form.getByLabel('پایان نیمسال', { exact: true }).fill(endYear);
  await save(form);

  await go(page, '/students');
  form = await open(page, 'ثبت تکی');
  await form.getByLabel('نام', { exact: true }).fill('دانش‌آموز');
  await form.getByLabel('نام خانوادگی', { exact: true }).fill('آزمایشی ' + unique);
  await form.getByLabel('شناسهٔ دانش‌آموزی').fill(unique);
  await select(form, 'کلاس', cls);
  await form.getByLabel('نام کاربری').fill(studentLogin);
  await form.getByLabel('رمز موقت').fill(studentPassword);
  await save(form, 'ایجاد حساب دانش‌آموز');
  const studentLink = page.getByRole('link', { name: 'دانش‌آموز آزمایشی ' + unique, exact: true });
  await expect(studentLink).toBeVisible();
  const studentId = (await studentLink.getAttribute('href'))!.split('/').at(-1)!;

  form = await open(page, 'ورود گروهی از اکسل یا CSV');
  await select(form, 'کلاس', cls);
  const { default: ExcelImport } = await import('exceljs');
  const enrollmentBook = new ExcelImport.Workbook();
  const enrollmentSheet = enrollmentBook.addWorksheet('Import');
  enrollmentSheet.addRow(['login', 'password', 'code', 'first', 'last']);
  enrollmentSheet.addRow(['bulk.' + unique, studentPassword, 'bulk-' + unique, 'دانش‌آموز گروهی', unique]);
  await form.getByLabel('فایل ورود گروهی').setInputFiles({
    name: 'students.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(await enrollmentBook.xlsx.writeBuffer()),
  });
  await expect(form.getByRole('status')).toHaveText('فایل آمادهٔ ثبت است.');
  await save(form, 'ثبت گروهی');
  await expect(page.getByRole('link', { name: 'دانش‌آموز گروهی ' + unique, exact: true })).toBeVisible();

  await go(page, '/attendance');
  const filter = page.locator('form.filter');
  await select(filter, 'مدرسه', school);
  await select(filter, 'کلاس', cls);
  await select(filter, 'درس', subject);
  await filter.getByRole('button', { name: 'نمایش فهرست کلاس' }).click();
  await page.getByRole('button', { name: 'همه حاضر' }).click();
  form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'ثبت حضور و غیاب', exact: true }) });
  await save(form, 'ثبت حضور و غیاب');
  await expect(page.getByRole('heading', { name: 'تاریخچهٔ ویرایش' })).toBeVisible();

  await go(page, '/grades');
  form = page
    .locator('section.panel')
    .filter({ has: page.getByRole('heading', { name: 'افزودن ارزیابی', exact: true }) })
    .locator('form');
  const homework = 'تکلیف شیمی ' + unique;
  await form.getByLabel('عنوان ارزیابی').fill(homework);
  await form.getByRole('combobox', { name: 'نوع ارزیابی' }).selectOption('assignment');
  await select(form, 'کلاس', cls);
  await select(form, 'نیمسال', semester);
  await select(form, 'درس', subject);
  await save(form, 'ایجاد ارزیابی');
  await page.getByRole('link', { name: homework, exact: true }).click();
  form = page
    .locator('section.panel')
    .filter({ has: page.getByRole('heading', { name: 'ثبت نمره‌ها', exact: true }) })
    .locator('form');
  await form.getByLabel('نمرهٔ دانش‌آموز آزمایشی ' + unique).fill('19');
  await form.getByLabel('نمایش نمره در کارنامهٔ دانش‌آموز').check();
  await save(form, 'ثبت نمره‌ها');

  await go(page, '/questions');
  form = await open(page, 'سؤال تازه');
  await select(form, 'درس', subject);
  await form.getByLabel('صورت سؤال (Markdown / LaTeX)').fill('فرمول آب چیست؟');
  await form.getByLabel('گزینه‌ها یا ستون اول').fill('H2O\nCO2');
  await form.getByLabel('پاسخ‌نامه', { exact: true }).fill('1');
  await form.getByLabel('توضیح پاسخ', { exact: true }).fill('answer-key-canary-' + unique);
  await save(form, 'افزودن سؤال');
  await select(form, 'درس', subject);
  await form.getByRole('combobox', { name: 'نوع سؤال' }).selectOption('long');
  await form.getByLabel('صورت سؤال (Markdown / LaTeX)').fill('پیوند کووالانسی را توضیح دهید.');
  await form.getByLabel('نمرهٔ سؤال').fill('3');
  await save(form, 'افزودن سؤال');

  await go(page, '/exams');
  form = await open(page, 'ساخت آزمون');
  await form.getByLabel('عنوان آزمون').fill(examName);
  await select(form, 'کلاس', cls);
  await select(form, 'درس', subject);
  const now = new Date();
  const windowStart = new Date(
    Math.max(now.getTime() - 90000, Date.parse(dayInTehran() + 'T00:00:00+03:30'))
  );
  await setTime(form, 'آغاز آزمون', windowStart);
  await setTime(form, 'پایان آزمون', new Date(now.getTime() + 1200000));
  await form.getByLabel('نمرهٔ قبولی').fill('2');
  await form.getByLabel('نمایش پاسخ‌نامه همراه نتایج منتشرشده').check();
  await form.getByText('گزینش سؤال از بانک', { exact: true }).click();
  await form.getByLabel(/فرمول آب چیست/).check();
  await form.getByLabel(/پیوند کووالانسی/).check();
  await save(form, 'ساخت پیش‌نویس');
  const examLink = page.getByRole('link', { name: examName, exact: true });
  const examPath = (await examLink.getAttribute('href'))!;
  await examLink.click();
  await expect(page).toHaveURL(testOrigin + examPath);
  const examId = examPath.split('/').at(-1)!;
  form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'انتشار آزمون', exact: true }) });
  await form.getByRole('button', { name: 'انتشار آزمون', exact: true }).click();
  await expect(page.getByRole('link', { name: /پیوند اختصاصی آزمون/ })).toBeVisible();

  const student = await browser.newPage();
  await login(student, studentLogin, studentPassword);
  await expect(student.getByText('برای دسترسی به سامانه، رمز موقت را تغییر دهید.')).toBeVisible();
  await student.getByLabel('رمز فعلی', { exact: true }).fill(studentPassword);
  await student.getByLabel('رمز جدید (حداقل ۱۴ نویسه)').fill(finalPassword);
  await student.getByRole('button', { name: 'ذخیره', exact: true }).click();
  await expect(student).toHaveURL(/\/login$/);
  await login(student, studentLogin, finalPassword);
  await expect(
    student.getByRole('heading', { name: 'دانش‌آموز آزمایشی ' + unique + '، خوش آمدید' })
  ).toBeVisible();
  const noAccess = await student.request.get('/api/export?type=students');
  expect(noAccess.status()).toBe(403);
  await student.goto('/take/' + examId);
  await student.getByRole('button', { name: 'شروع آزمون' }).click();
  await expect(student.getByLabel('زمان باقی‌مانده')).toBeVisible();
  expect(await student.content()).not.toContain('answer-key-canary-' + unique);
  if ((await student.getByText('فرمول آب چیست؟', { exact: true }).count()) === 0)
    await student.getByRole('button', { name: 'سؤال بعد' }).click();
  await student.getByRole('radio', { name: 'H2O' }).check();
  await expect(student.getByRole('status')).toHaveText('پاسخ‌ها ذخیره شدند.');
  await student.reload();
  if ((await student.getByText('فرمول آب چیست؟', { exact: true }).count()) === 0)
    await student.getByRole('button', { name: 'سؤال بعد' }).click();
  await expect(student.getByRole('radio', { name: 'H2O' })).toBeChecked();
  if (await student.getByRole('button', { name: 'سؤال بعد' }).isEnabled())
    await student.getByRole('button', { name: 'سؤال بعد' }).click();
  else await student.getByRole('button', { name: 'سؤال قبل' }).click();
  await student.getByLabel('پاسخ تشریحی', { exact: true }).fill('اشتراک الکترون بین اتم‌ها');
  const answerRequest = student.waitForRequest(
    (r) => r.url().endsWith('/api/attempt') && r.postDataJSON().action === 'sync'
  );
  await expect(student.getByRole('status')).toHaveText('پاسخ‌ها ذخیره شدند.');
  const attemptId = (await answerRequest).postDataJSON().id;
  await student.getByRole('button', { name: 'تحویل نهایی آزمون' }).click();
  await student.getByRole('button', { name: 'تأیید و تحویل' }).click();
  await expect(student.getByRole('heading', { name: 'برگه تحویل شد' })).toBeVisible();
  await expect(student.getByText('نتیجه هنوز برای این برگه منتشر نشده است.')).toBeVisible();
  expect(await student.getByText('پاسخ‌نامه', { exact: true }).count()).toBe(0);
  const repeat = await student.request.post('/api/attempt', {
    headers: { origin: testOrigin },
    data: { action: 'sync', id: attemptId, answers: [], submit: true },
  });
  expect(await repeat.json()).toEqual({ submitted: true });

  await changeDatabase(
    "UPDATE exams SET starts=now()-interval '30 minutes',ends=now()-interval '1 minute' WHERE id=$1",
    [examId]
  );
  await go(page, examPath);
  form = page.locator('form').filter({ has: page.getByRole('button', { name: 'ذخیرهٔ وضعیت انتشار' }) });
  await form.getByLabel('نتیجهٔ تصحیح‌شده برای دانش‌آموزان قابل مشاهده باشد').check();
  await form.getByRole('button', { name: 'ذخیرهٔ وضعیت انتشار' }).click();
  await expect(form.getByRole('alert')).toHaveText('ابتدا همهٔ برگه‌ها را نهایی کنید.');
  await page.getByRole('link', { name: 'دانش‌آموز آزمایشی ' + unique, exact: true }).click();
  const panel = page
    .locator('section.panel')
    .filter({ has: page.getByText('پیوند کووالانسی را توضیح دهید.', { exact: true }) });
  form = panel.locator('form');
  await form.getByLabel('نمره', { exact: true }).fill('2.5');
  await form.getByLabel('بازخورد برای دانش‌آموز').fill('پاسخ قابل قبول است.');
  await save(form, 'ثبت نمره و بازخورد');
  await go(page, examPath);
  form = page.locator('form').filter({ has: page.getByRole('button', { name: 'ذخیرهٔ وضعیت انتشار' }) });
  await form.getByLabel('نتیجهٔ تصحیح‌شده برای دانش‌آموزان قابل مشاهده باشد').check();
  await save(form, 'ذخیرهٔ وضعیت انتشار');
  await student.reload();
  await expect(student.getByText('نمرهٔ نهایی', { exact: false })).toContainText('۳.۵');
  await go(page, '/reports');
  await expect(page.getByRole('heading', { name: 'مرکز گزارش‌ها' })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'خروجی اکسل' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('teacher-report.xlsx');
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile((await download.path())!);
  expect(book.worksheets.map((sheet) => sheet.name)).toEqual(['حضور', 'غیبت', 'آزمون', 'نمره']);
  const printable = await page.pdf({ format: 'A4' });
  expect(printable.subarray(0, 5).toString()).toBe('%PDF-');
  await student.goto('/grades');
  await expect(student.getByRole('heading', { name: 'کارنامهٔ تحصیلی' })).toBeVisible();
  expect((await student.request.get('/api/export?type=student&student=' + studentId)).status()).toBe(200);
  await expect(student.getByText('تکلیف شیمی ' + unique, { exact: true })).toBeVisible();
  expect((await student.request.get('/api/export?type=student&student=' + examId)).status()).toBe(403);
  await student.close();
});

test('mobile RTL navigation and Jalali date picker', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, credentials.login, credentials.password);
  await expect(page.getByRole('button', { name: 'منو', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'منو', exact: true }).click();
  await page
    .getByRole('navigation', { name: '', exact: true })
    .getByRole('link', { name: 'تقویم کاری', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'تقویم کاری', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'انتخاب تاریخ تقویم' }).click();
  await expect(page.getByRole('group', { name: 'تقویم شمسی' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'تقویم شمسی' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const landing = await page.request.post('/api/attempt', {
    headers: { origin: 'https://invalid.example' },
    data: { action: 'start' },
  });
  expect(landing.status()).toBe(403);
});

test('expired attempt submits server-side and ignores late answers', async ({ page }) => {
  test.skip(!process.env.TEST_DATABASE_URL, 'Use a disposable PostgreSQL database.');
  const { hashPassword } = await import('../../lib/password');
  const { randomUUID } = await import('node:crypto');
  const ids = Array.from({ length: 8 }, () => randomUUID());
  const [s, y, c, d, u, e, q, a] = ids;
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  const loginName = 'expiry.' + Date.now().toString(36);
  try {
    await db.query('BEGIN');
    await db.query('INSERT INTO schools(id,name) VALUES($1,$2)', [s, 'مدرسهٔ زمان‌سنج']);
    await db.query("INSERT INTO years(id,school_id,name,starts,ends) VALUES($1,$2,'QA',$3,$4)", [
      y,
      s,
      dayInTehran(new Date(Date.now() - 86400000)),
      dayInTehran(new Date(Date.now() + 86400000)),
    ]);
    await db.query("INSERT INTO classes(id,school_id,year_id,name,level) VALUES($1,$2,$3,'QA','1')", [
      c,
      s,
      y,
    ]);
    await db.query("INSERT INTO subjects(id,school_id,name) VALUES($1,$2,'QA')", [d, s]);
    await db.query("INSERT INTO users(id,role,login,name,password) VALUES($1,'student',$2,'زمان‌سنج',$3)", [
      u,
      loginName,
      await hashPassword(finalPassword),
    ]);
    await db.query("INSERT INTO students(id,code,first_name,last_name) VALUES($1,$2,'زمان','سنج')", [
      u,
      loginName,
    ]);
    await db.query('INSERT INTO enrollments(student_id,class_id,starts) VALUES($1,$2,$3)', [
      u,
      c,
      dayInTehran(new Date(Date.now() - 86400000)),
    ]);
    await db.query(
      `INSERT INTO exams(id,school_id,class_id,subject_id,title,description,instructions,starts,ends,publish_at,minutes,passing,max_attempts,shuffle,shuffle_options,negative,reveal,state)
   VALUES($1,$2,$3,$4,'آزمون زمان‌سنج','','',now()-interval '2 minutes',now()+interval '30 minutes',now()-interval '10 minutes',1,1,1,false,false,false,false,'published')`,
      [e, s, c, d]
    );
    await db.query(
      "INSERT INTO exam_questions(id,exam_id,position,kind,prompt,definition) VALUES($1,$2,0,'single','زمان؟',$3)",
      [
        q,
        e,
        JSON.stringify({
          points: 2,
          penalty: 0,
          partial: false,
          key: [0],
          options: ['الف', 'ب'],
          right: [],
          tolerance: 0,
          attachment: null,
        }),
      ]
    );
    await db.query('COMMIT');
    await login(page, loginName, finalPassword);
    await expect(page.getByRole('heading', { name: 'زمان‌سنج، خوش آمدید' })).toBeVisible();
    const duplicateHeaders = { origin: testOrigin };
    const started = await Promise.all(
      [1, 2].map(() =>
        page.request.post('/api/attempt', {
          headers: duplicateHeaders,
          data: { action: 'start', id: e, code: '' },
        })
      )
    );
    const [first, second] = await Promise.all(started.map((res) => res.json()));
    expect(first.id).toBeTruthy();
    expect(first.id).toBe(second.id);
    expect((await db.query('SELECT count(*)::int AS n FROM attempts WHERE exam_id=$1', [e])).rows[0].n).toBe(
      1
    );
    await db.query("UPDATE attempts SET deadline=now()-interval '1 second' WHERE id=$1", [first.id]);
    const late = await page.request.post('/api/attempt', {
      headers: duplicateHeaders,
      data: {
        action: 'sync',
        id: first.id,
        submit: false,
        answers: [{ id: q, value: 0, flag: false, revision: 1 }],
      },
    });
    expect(await late.json()).toEqual({ submitted: true });
    const result = (
      await db.query(
        'SELECT a.score,a.finalized,b.value FROM attempts a JOIN answers b ON b.attempt_id=a.id WHERE a.id=$1',
        [first.id]
      )
    ).rows[0];
    expect(result).toEqual({ score: '0.00', finalized: true, value: null });
    const denied = await page.request.post('/api/attempt', {
      headers: duplicateHeaders,
      data: { action: 'sync', id: a, submit: true, answers: [] },
    });
    expect(denied.status()).toBe(400);
    await page.goto('/take/' + e);
    await expect(page.getByRole('heading', { name: 'برگه تحویل شد' })).toBeVisible();
  } finally {
    await db.end();
  }
});

test('calendar recurrence, private files, and cron authorization', async ({ page, browser }) => {
  await login(page, credentials.login, credentials.password);
  await expect(page.getByText('میز کار معلم')).toBeVisible();
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKT8AAAAASUVORK5CYII=',
    'base64'
  );
  const stored = await page.request.post('/api/files', {
    headers: { origin: testOrigin },
    multipart: { file: { name: 'pixel.png', mimeType: 'image/png', buffer: bytes } },
  });
  expect(stored.status()).toBe(200);
  const asset = (await stored.json()).id as string;
  const download = await page.request.get('/api/files/' + asset);
  expect(download.headers()['cache-control']).toBe('private, no-store');
  expect(await download.body()).toEqual(bytes);
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(testOrigin + '/api/files/' + asset)).status()).toBe(404);
  await anonymous.close();
  const invalid = await page.request.post('/api/files', {
    headers: { origin: testOrigin },
    multipart: {
      file: {
        name: 'unsafe.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      },
    },
  });
  expect(invalid.status()).toBe(400);
  expect((await page.request.get('/api/cron')).status()).toBe(401);
  if (process.env.CRON_SECRET) {
    expect(
      (
        await page.request.get('/api/cron', {
          headers: { authorization: 'Bearer ' + process.env.CRON_SECRET },
        })
      ).status()
    ).toBe(200);
  }
  await page.goto('/calendar');
  const form = await open(page, 'افزودن به تقویم');
  const reminder = 'یادآوری آزمایشی ' + unique;
  await form.getByLabel('عنوان رویداد').fill(reminder);
  await form.getByRole('combobox', { name: 'نوع رویداد' }).selectOption('reminder');
  await setTime(form, 'شروع', new Date(Date.now() + 21600000));
  await setTime(form, 'پایان', new Date(Date.now() + 23400000));
  await form.getByLabel('تعداد تکرار هفتگی').fill('2');
  await save(form);
  const day = jalaliInput(dayInTehran(new Date(Date.now() + 21600000)));
  await page.goto('/calendar?view=day&day=' + encodeURIComponent(day));
  await expect(page.getByRole('link', { name: reminder, exact: true })).toBeVisible();
  if (process.env.TEST_DATABASE_URL) {
    const count = await changeDatabase('SELECT count(*)::int n FROM events WHERE title=$1', [reminder]);
    expect(count.rows[0].n).toBe(2);
  }
});
