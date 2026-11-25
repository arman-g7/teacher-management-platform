import Link from 'next/link';
import { notFound } from 'next/navigation';
import { rows, one, sql } from '@/lib/db';
import { catalog, type Catalog } from '@/lib/catalog';
import { jalali, jalaliInput, dayInTehran, localDigits } from '@/lib/date';
import { uuid } from '@/lib/forms';
import { roster, classScope, statuses, assessmentKinds } from '@/lib/teacher';
import { Form, JalaliField, MarkPresent, Print, Upload } from './controls';
import { Check, choices, Empty, Hidden, Input, Panel, Select, Table, Text } from './forms';
import { ImportStudents } from './imports';
import { StudentReport } from './reports';
type Search = Record<string, string | undefined>;
type School = { id: string; name: string; address: string; phone: string; logo: string; archived: boolean };
type NamedDate = { id: string; name: string; starts: string; ends: string; group_name: string };
type Class = { id: string; name: string; year_id: string; level: string; archived: boolean; school: string };
export const today = () => jalaliInput(dayInTehran());
export const valid = (value?: string) => (uuid.safeParse(value).success ? value : undefined);
export const pathFor = (path: string, search: Search) =>
  path +
  '?' +
  new URLSearchParams(
    Object.entries(search).filter(
      (pair): pair is [string, string] => typeof pair[1] === 'string' && !!pair[1]
    )
  ).toString();
export function Heading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="disclosure">
      <summary>{title}</summary>
      <div>{children}</div>
    </details>
  );
}
export function PageNav({
  path,
  query,
  page,
  more,
}: {
  path: string;
  query: Search;
  page: number;
  more: boolean;
}) {
  if (!more && page === 1) return null;
  return (
    <nav className="row no-print" aria-label="صفحه‌بندی">
      {page > 1 && (
        <Link className="button outline" href={pathFor(path, { ...query, page: String(page - 1) })}>
          صفحهٔ قبل
        </Link>
      )}
      <span>صفحهٔ {localDigits(page)}</span>
      {more && (
        <Link className="button outline" href={pathFor(path, { ...query, page: String(page + 1) })}>
          صفحهٔ بعد
        </Link>
      )}
    </nav>
  );
}
export function pageNumber(value?: string) {
  return Math.max(1, Math.min(10000, Number(value) || 1)) | 0;
}
function SchoolForm({ item }: { item?: School }) {
  return (
    <Form operation="school" reset={!item}>
      <Hidden id={item?.id} />
      <Input name="name" label="نام مدرسه" required defaultValue={item?.name} />
      <Input name="phone" label="تلفن" defaultValue={item?.phone} />
      <Input name="address" label="نشانی" defaultValue={item?.address} />
      <Upload name="logo" label="نشان مدرسه" accept=".png,.jpg,.jpeg" previous={item?.logo} />
      <Check name="archived" label="بایگانی" defaultChecked={item?.archived} />
    </Form>
  );
}
function ClassForm({ data, item }: { data: Catalog; item?: Class }) {
  return (
    <Form operation="class" reset={!item}>
      <Hidden id={item?.id} />
      <Select name="year" label="سال تحصیلی" choices={data.years} value={item?.year_id} />
      <Input name="name" label="نام کلاس" required defaultValue={item?.name} />
      <Input name="level" label="پایه" required defaultValue={item?.level} />
      <Check name="archived" label="بایگانی" defaultChecked={item?.archived} />
    </Form>
  );
}
export async function Schools({ data }: { data: Catalog }) {
  const [schools, periods, terms, classes] = await Promise.all([
    rows<School>(sql`SELECT * FROM schools ORDER BY archived,name`),
    rows<NamedDate>(
      sql`SELECT y.*,s.name AS group_name FROM years y JOIN schools s ON s.id=y.school_id ORDER BY y.starts DESC`
    ),
    rows<NamedDate>(
      sql`SELECT t.*,y.name AS group_name FROM terms t JOIN years y ON y.id=t.year_id ORDER BY t.starts DESC`
    ),
    rows<Class>(
      sql`SELECT c.*,s.name AS school FROM classes c JOIN schools s ON s.id=c.school_id ORDER BY c.archived,s.name,c.name`
    ),
  ]);
  return (
    <>
      <Heading
        title="مدارس و کلاس‌ها"
        description="ساختار آموزشی هر مدرسه را بر اساس سال و نیمسال تنظیم کنید."
      />
      <div className="two-col">
        <Panel title="مدارس">
          <Disclosure title="افزودن مدرسه">
            <SchoolForm />
          </Disclosure>
          {schools.map((s) => (
            <Disclosure key={s.id} title={s.name + (s.archived ? ' · بایگانی' : '')}>
              <SchoolForm item={s} />
              <div className="row">
                <Link className="text-link" href={pathFor('/reports', { school: s.id })}>
                  گزارش مدرسه
                </Link>
                <Link className="text-link" href={pathFor('/calendar', { school: s.id })}>
                  تقویم مدرسه
                </Link>
              </div>
            </Disclosure>
          ))}
        </Panel>
        <Panel title="کلاس‌ها">
          <Disclosure title="افزودن کلاس">
            <ClassForm data={data} />
          </Disclosure>
          {classes.map((c) => (
            <Disclosure key={c.id} title={c.school + ' · ' + c.name + (c.archived ? ' · بایگانی' : '')}>
              <ClassForm data={data} item={c} />
            </Disclosure>
          ))}
        </Panel>
      </div>
      <div className="two-col">
        <Panel title="سال‌های تحصیلی و نیمسال‌ها">
          <Disclosure title="افزودن سال تحصیلی">
            <Form operation="year" reset>
              <Select name="school" label="مدرسه" choices={data.schools} />
              <Input name="name" label="نام سال" required />
              <JalaliField name="start" label="آغاز سال" />
              <JalaliField name="end" label="پایان سال" />
            </Form>
          </Disclosure>
          <Disclosure title="افزودن نیمسال">
            <Form operation="term" reset>
              <Select name="year" label="سال تحصیلی" choices={data.years} />
              <Input name="name" label="نام نیمسال" required />
              <JalaliField name="start" label="آغاز نیمسال" />
              <JalaliField name="end" label="پایان نیمسال" />
            </Form>
          </Disclosure>
          <Table
            heads={['عنوان', 'گروه', 'آغاز', 'پایان']}
            rows={[...periods, ...terms].map((x) => [x.name, x.group_name, jalali(x.starts), jalali(x.ends)])}
          />
        </Panel>
        <Panel title="درس‌ها">
          <Form operation="subject" reset>
            <Select name="school" label="مدرسه" choices={data.schools} />
            <Input name="name" label="نام درس" required />
          </Form>
          <div className="tag-list">
            {data.subjects.map((x) => (
              <span className="badge" key={x.id}>
                {x.name}
              </span>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
type Student = {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  code: string;
  status: string;
  active: boolean;
  archived: boolean;
  photo: string;
  contact: string;
  guardian: string;
  notes: string;
  login: string;
  class_name: string;
  school_name: string;
  starts: string;
};
export async function Students({
  data,
  query,
  detail: key,
}: {
  data: Catalog;
  query: Search;
  detail?: string;
}) {
  if (key) {
    const s = valid(key)
      ? await one<Student>(
          sql`SELECT s.*,u.name,u.active,u.photo,u.login,c.name AS class_name,h.name AS school_name,e.starts FROM students s JOIN users u ON u.id=s.id LEFT JOIN enrollments e ON e.student_id=s.id AND e.ends IS NULL LEFT JOIN classes c ON c.id=e.class_id LEFT JOIN schools h ON h.id=c.school_id WHERE s.id=${key}`
        )
      : undefined;
    if (!s) notFound();
    return (
      <>
        <Heading
          title={s.name}
          description={[s.code, s.school_name, s.class_name, s.starts ? jalali(s.starts) : '']
            .filter(Boolean)
            .join(' · ')}
          action={
            <Link className="button outline" href="/students">
              فهرست دانش‌آموزان
            </Link>
          }
        />
        <div className="two-col">
          <Panel title="مشخصات و حساب کاربری">
            {s.photo && <img className="profile-photo" src={'/api/files/' + s.photo} alt={s.name} />}
            <p>
              نام کاربری <bdi>{s.login}</bdi>
            </p>
            <Form operation="studentEdit">
              <Hidden id={s.id} />
              <Input label="نام" name="first" defaultValue={s.first_name} required />
              <Input label="نام خانوادگی" name="last" defaultValue={s.last_name} required />
              <Input label="تماس دانش‌آموز" name="contact" defaultValue={s.contact} />
              <Input label="تماس سرپرست" name="guardian" defaultValue={s.guardian} />
              <Input label="وضعیت تحصیلی" name="status" defaultValue={s.status} required />
              <Input
                label="رمز موقت تازه"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={14}
              />
              <Upload name="photo" label="عکس دانش‌آموز" accept=".png,.jpg,.jpeg" />
              <Text label="یادداشت خصوصی" name="notes" defaultValue={s.notes} />
              <Check name="active" label="حساب فعال" defaultChecked={s.active} />
              <Check name="archived" label="بایگانی" defaultChecked={s.archived} />
            </Form>
          </Panel>
          <Panel title="انتقال بین کلاس‌ها">
            <Form operation="transfer" caption="انتقال دانش‌آموز">
              <Hidden id={s.id} />
              <Select name="class" label="کلاس مقصد" choices={data.classes} />
              <JalaliField name="day" label="تاریخ انتقال" value={today()} />
            </Form>
          </Panel>
        </div>
        <StudentReport id={s.id} teacher />
      </>
    );
  }
  const page = pageNumber(query.page),
    term = (query.q ?? '').trim().slice(0, 100);
  const filters = sql`WHERE s.archived=${query.archived === '1'} ${valid(query.school) ? sql`AND c.school_id=${query.school}` : sql``} ${valid(query.class) ? sql`AND c.id=${query.class}` : sql``}
 ${term ? sql`AND (position(lower(${term}) in lower(u.name))>0 OR position(lower(${term}) in lower(s.code))>0 OR position(lower(${term}) in lower(u.login))>0)` : sql``}`;
  const list = await rows<Student>(
    sql`SELECT s.id,s.code,s.status,u.name,u.active,c.name AS class_name,h.name AS school_name FROM students s JOIN users u ON u.id=s.id LEFT JOIN enrollments e ON e.student_id=s.id AND e.ends IS NULL LEFT JOIN classes c ON c.id=e.class_id LEFT JOIN schools h ON h.id=c.school_id ${filters} ORDER BY u.name,s.id LIMIT 31 OFFSET ${(page - 1) * 30}`
  );
  return (
    <>
      <Heading
        title="دانش‌آموزان"
        description="پرونده، عضویت در کلاس و حساب‌های دانش‌آموزی را مدیریت کنید."
        action={
          <a className="button outline" href={pathFor('/api/export', { ...query, type: 'students' })}>
            خروجی اکسل
          </a>
        }
      />
      <Panel title="افزودن دانش‌آموز">
        <Disclosure title="ثبت تکی">
          <Form operation="student" caption="ایجاد حساب دانش‌آموز" reset>
            <Input label="نام" name="first" required />
            <Input label="نام خانوادگی" name="last" required />
            <Input label="شناسهٔ دانش‌آموزی" name="code" required />
            <Select name="class" label="کلاس" choices={data.classes} />
            <JalaliField name="day" label="تاریخ ثبت‌نام" value={today()} />
            <Input label="نام کاربری" name="login" required dir="ltr" />
            <Input
              label="رمز موقت"
              name="password"
              required
              minLength={14}
              type="password"
              autoComplete="new-password"
              dir="ltr"
            />
            <Input label="تماس دانش‌آموز" name="contact" />
            <Input label="تماس سرپرست" name="guardian" />
            <Text label="یادداشت خصوصی" name="notes" />
          </Form>
        </Disclosure>
        <Disclosure title="ورود گروهی از اکسل یا CSV">
          <Form operation="importStudents" caption="ثبت گروهی">
            <Select name="class" label="کلاس" choices={data.classes} />
            <JalaliField name="day" label="تاریخ ثبت‌نام" value={today()} />
            <ImportStudents />
          </Form>
        </Disclosure>
      </Panel>
      <Panel title="فهرست دانش‌آموزان">
        <form className="filter no-print">
          <Input label="جست‌وجو" name="q" defaultValue={term} />
          <Select label="مدرسه" name="school" choices={data.schools} blank="همه" value={query.school} />
          <Select label="کلاس" name="class" choices={data.classes} blank="همه" value={query.class} />
          <Select
            label="وضعیت پرونده"
            name="archived"
            choices={choices({ '0': 'جاری', '1': 'بایگانی' })}
            value={query.archived ?? '0'}
          />
          <button className="button primary">جست‌وجو</button>
        </form>
        <Table
          heads={['دانش‌آموز', 'شناسه', 'مدرسه', 'کلاس', 'حساب']}
          rows={list.slice(0, 30).map((s) => [
            <Link className="text-link" href={'/students/' + s.id}>
              {s.name}
            </Link>,
            localDigits(s.code),
            s.school_name || '—',
            s.class_name || '—',
            <span className={'badge ' + (s.active ? 'good' : 'warning')}>
              {s.active ? s.status : 'غیرفعال'}
            </span>,
          ])}
        />
        <PageNav path="/students" query={query} page={page} more={list.length > 30} />
      </Panel>
    </>
  );
}
type AttendanceEntry = {
  id: string;
  school: string;
  class: string;
  subject: string;
  day: string;
  slot: number;
  count: number;
  present: number;
};
export async function Attendance({
  data,
  query,
  detail: key,
}: {
  data: Catalog;
  query: Search;
  detail?: string;
}) {
  const session = valid(key)
    ? await one<{ id: string; class_id: string; subject_id: string; day: string; slot: number }>(
        sql`SELECT id,class_id,subject_id,day,slot FROM attendance_sessions WHERE id=${key}`
      )
    : undefined;
  if (key && !session) notFound();
  const cls = session?.class_id || valid(query.class),
    subject = session?.subject_id || valid(query.subject),
    day = session?.day ? jalaliInput(session.day) : query.day || today(),
    slot = session?.slot ?? (/^\d{1,2}$/.test(query.slot ?? '') ? Number(query.slot) : 1);
  const { gregorian } = await import('@/lib/date');
  let iso: string | undefined;
  try {
    iso = gregorian(day);
  } catch {}
  const existing =
    session ??
    (cls && subject && iso && slot >= 1 && slot <= 20
      ? await one<{ id: string }>(
          sql`SELECT id FROM attendance_sessions WHERE class_id=${cls} AND subject_id=${subject} AND day=${iso} AND slot=${slot}`
        )
      : undefined);
  const scope = cls ? await classScope(cls) : undefined;
  const learners = cls && iso && scope && subject ? await roster(cls, iso) : [];
  const saved = existing
    ? new Map(
        (
          await rows<{ student_id: string; status: string; note: string }>(
            sql`SELECT student_id,status,note FROM attendance WHERE session_id=${existing.id}`
          )
        ).map((v) => [v.student_id, v])
      )
    : new Map();
  const recent = await rows<AttendanceEntry>(
    sql`SELECT h.id, s.name school,c.name class,d.name subject,h.day,h.slot,count(a.student_id)::int count,count(*) FILTER(WHERE a.status IN ('present','late','early'))::int present FROM attendance_sessions h JOIN schools s ON s.id=h.school_id JOIN classes c ON c.id=h.class_id JOIN subjects d ON d.id=h.subject_id LEFT JOIN attendance a ON a.session_id=h.id ${valid(query.school) ? sql`WHERE h.school_id=${query.school}` : sql``} GROUP BY h.id,s.name,c.name,d.name ORDER BY h.day DESC,h.slot DESC LIMIT 30`
  );
  const history = existing
    ? await rows<{ at: Date; name: string; detail: { before?: unknown[]; after?: unknown[] } }>(
        sql`SELECT a.at,u.name,a.detail FROM audit a JOIN users u ON u.id=a.actor WHERE entity='attendance' AND entity_id=${existing.id} ORDER BY at DESC LIMIT 20`
      )
    : [];
  return (
    <>
      <Heading
        title="حضور و غیاب"
        description="حضور کلاس را ثبت کنید و سوابق هر جلسه را مرور کنید."
        action={
          <div className="row">
            <Print />
            {existing && (
              <a
                className="button outline"
                href={pathFor('/api/export', { type: 'attendance', session: existing.id })}
              >
                اکسل این جلسه
              </a>
            )}
          </div>
        }
      />
      <Panel title="انتخاب جلسه">
        <form className="filter no-print" action="/attendance">
          <Select
            label="مدرسه"
            name="school"
            choices={data.schools}
            blank="همهٔ مدارس"
            value={query.school}
          />
          <Select label="کلاس" name="class" choices={data.classes} value={cls} />
          <Select label="درس" name="subject" choices={data.subjects} value={subject} />
          <JalaliField name="day" label="تاریخ جلسه" value={day} />
          <Input label="شمارهٔ زنگ" name="slot" type="number" min={1} max={20} defaultValue={slot} />
          <button className="button primary">نمایش فهرست کلاس</button>
        </form>
        {!iso && <p role="alert">تاریخ شمسی معتبر وارد کنید.</p>}
        {learners.length > 0 ? (
          <div className="stack">
            <Form key={[cls, subject, day, slot].join(':')} operation="attendance" caption="ثبت حضور و غیاب">
              <input type="hidden" name="class" value={cls} />
              <input type="hidden" name="subject" value={subject} />
              <input type="hidden" name="day" value={day} />
              <input type="hidden" name="slot" value={slot} />
              <div className="full row no-print">
                <MarkPresent />
              </div>
              <div className="full">
                <Table
                  heads={['دانش‌آموز', 'وضعیت', 'یادداشت']}
                  rows={learners.map((s) => [
                    s.name,
                    <label className="field">
                      <select
                        aria-label={'وضعیت ' + s.name}
                        name={'status_' + s.student_id}
                        defaultValue={saved.get(s.student_id)?.status || 'present'}
                        data-attendance
                      >
                        {Object.entries(statuses).map(([v, title]) => (
                          <option key={v} value={v}>
                            {title}
                          </option>
                        ))}
                      </select>
                    </label>,
                    <Input
                      label="یادداشت"
                      name={'note_' + s.student_id}
                      defaultValue={saved.get(s.student_id)?.note}
                    />,
                  ])}
                />
              </div>
            </Form>
            <div className="print-only">
              <Table
                heads={['دانش‌آموز', 'وضعیت', 'یادداشت']}
                rows={learners.map((s) => {
                  const x = saved.get(s.student_id);
                  return [s.name, x ? statuses[x.status as keyof typeof statuses] : '—', x?.note || '—'];
                })}
              />
            </div>
          </div>
        ) : (
          <Empty>
            {cls && subject
              ? 'برای این تاریخ فهرستی در کلاس وجود ندارد.'
              : 'برای مشاهدهٔ فهرست، کلاس و درس را انتخاب کنید.'}
          </Empty>
        )}
      </Panel>
      <Panel title="سوابق اخیر">
        <Table
          heads={['مدرسه', 'کلاس', 'درس', 'تاریخ', 'زنگ', 'حاضر', '']}
          rows={recent.map((x) => [
            x.school,
            x.class,
            x.subject,
            jalali(x.day),
            localDigits(x.slot),
            localDigits(x.present) + ' / ' + localDigits(x.count),
            <Link className="text-link" href={'/attendance/' + x.id}>
              مشاهده
            </Link>,
          ])}
        />
      </Panel>
      {existing && (
        <Panel title="تاریخچهٔ ویرایش">
          <Table
            heads={['زمان', 'کاربر', 'ثبت قبل / بعد']}
            rows={history.map((x) => [
              jalali(x.at, true),
              x.name,
              <details>
                <summary>
                  {localDigits(x.detail.before?.length ?? 0)} / {localDigits(x.detail.after?.length ?? 0)}
                </summary>
                <pre dir="ltr">{JSON.stringify(x.detail, null, 2)}</pre>
              </details>,
            ])}
          />
        </Panel>
      )}
    </>
  );
}
type Assessment = {
  id: string;
  title: string;
  class_id: string;
  class_name: string;
  subject: string;
  day: string;
  maximum: string;
  weight: string;
  kind: keyof typeof assessmentKinds;
  published: boolean;
};
export async function Gradebook({ data, detail: key }: { data: Catalog; detail?: string }) {
  if (key) {
    const x = valid(key)
      ? await one<Assessment>(
          sql`SELECT a.*,c.name AS class_name,d.name AS subject FROM assessments a JOIN classes c ON c.id=a.class_id JOIN subjects d ON d.id=a.subject_id WHERE a.id=${key}`
        )
      : undefined;
    if (!x) notFound();
    const [learners, grades, history] = await Promise.all([
      roster(x.class_id, x.day),
      rows<{ student_id: string; score: string; feedback: string }>(
        sql`SELECT student_id,score,feedback FROM grades WHERE assessment_id=${key}`
      ),
      rows<{ at: Date; name: string; detail: unknown }>(
        sql`SELECT a.at,u.name,a.detail FROM audit a JOIN users u ON u.id=a.actor WHERE a.entity='assessment' AND a.entity_id=${key} AND a.action='grade' ORDER BY at DESC LIMIT 20`
      ),
    ]);
    const byId = new Map(grades.map((g) => [g.student_id, g]));
    return (
      <>
        <Heading
          title={x.title}
          description={x.class_name + ' · ' + x.subject + ' · سقف ' + localDigits(Number(x.maximum))}
          action={
            <Link className="button outline" href="/grades">
              دفتر نمره
            </Link>
          }
        />
        <Panel title="ثبت نمره‌ها">
          <Form operation="gradebook" caption="ثبت نمره‌ها">
            <Hidden id={x.id} />
            <div className="full">
              <Table
                heads={['دانش‌آموز', 'نمره', 'بازخورد']}
                rows={learners.map((s) => [
                  s.name,
                  <Input
                    label={'نمرهٔ ' + s.name}
                    name={'score_' + s.student_id}
                    defaultValue={byId.get(s.student_id)?.score}
                    inputMode="decimal"
                  />,
                  <Input
                    label="بازخورد"
                    name={'feedback_' + s.student_id}
                    defaultValue={byId.get(s.student_id)?.feedback}
                  />,
                ])}
              />
            </div>
            <Check name="published" label="نمایش نمره در کارنامهٔ دانش‌آموز" defaultChecked={x.published} />
          </Form>
        </Panel>
        <Panel title="تاریخچهٔ نمره‌ها">
          <Table
            heads={['زمان', 'کاربر', 'تغییرات']}
            rows={history.map((item) => [
              jalali(item.at, true),
              item.name,
              <details>
                <summary>نمایش تغییر</summary>
                <pre dir="ltr">{JSON.stringify(item.detail, null, 2)}</pre>
              </details>,
            ])}
          />
        </Panel>
      </>
    );
  }
  const list = await rows<Assessment>(
    sql`SELECT a.*,c.name AS class_name,d.name AS subject FROM assessments a JOIN classes c ON c.id=a.class_id JOIN subjects d ON d.id=a.subject_id ORDER BY a.day DESC LIMIT 100`
  );
  return (
    <>
      <Heading
        title="دفتر نمره"
        description="ارزیابی‌های کلاسی را بسازید و نمره، وزن و بازخورد را ثبت کنید."
      />
      <Panel title="افزودن ارزیابی">
        <Form operation="assessment" caption="ایجاد ارزیابی" reset>
          <Input name="title" label="عنوان ارزیابی" required />
          <Select name="kind" label="نوع ارزیابی" choices={choices(assessmentKinds)} />
          <Select name="class" label="کلاس" choices={data.classes} />
          <Select name="term" label="نیمسال" choices={data.terms} />
          <Select name="subject" label="درس" choices={data.subjects} />
          <JalaliField name="day" label="تاریخ ارزیابی" value={today()} />
          <Input name="maximum" label="سقف نمره" defaultValue="20" inputMode="decimal" required />
          <Input name="weight" label="وزن ارزیابی" defaultValue="1" inputMode="decimal" required />
        </Form>
      </Panel>
      <Panel title="ارزیابی‌ها">
        <Table
          heads={['عنوان', 'کلاس', 'درس', 'تاریخ', 'وزن', 'انتشار']}
          rows={list.map((x) => [
            <Link href={'/grades/' + x.id} className="text-link">
              {x.title}
            </Link>,
            x.class_name,
            x.subject,
            jalali(x.day),
            localDigits(Number(x.weight)),
            x.published ? 'منتشر شده' : 'خصوصی',
          ])}
        />
      </Panel>
    </>
  );
}
