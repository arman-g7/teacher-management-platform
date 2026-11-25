import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileQuestion,
  GraduationCap,
  Layers3,
  School,
} from 'lucide-react';
import { one, rows, sql } from '@/lib/db';
import { catalog, settings } from '@/lib/catalog';
import { attendanceStats, examStats, filters, gradeStats, type Search } from '@/lib/reporting';
import { addDays, calendarWindow, eventDays, events, timeLabel } from '@/lib/calendar';
import { jalali, dayInTehran, jalaliInput, localDigits } from '@/lib/date';
import { requireUser } from '@/lib/auth';
import { sweepExpired } from '@/lib/exams';
import { CalendarGrid } from './calendar-grid';
import { Empty, Panel, Table } from './forms';
import { MetricsChart } from './charts';
import { ReportFilter } from './reports';
import { StudentExams } from './student';
export async function Dashboard({ query }: { query: Search }) {
  const user = await requireUser();
  if (user.role === 'student')
    return (
      <>
        <div className="hero">
          <div>
            <div className="overline">فضای دانش‌آموزی</div>
            <h1>{user.name}، خوش آمدید</h1>
            <p>آزمون‌ها، حضور و نمره‌های منتشرشدهٔ شما در دسترس است.</p>
            <div className="hero-actions row">
              <Link className="button" href="/exams">
                آزمون‌های من <ArrowLeft size={16} />
              </Link>
              <Link className="button" href="/grades">
                کارنامهٔ من
              </Link>
            </div>
          </div>
          <div className="hero-art">
            <GraduationCap size={66} strokeWidth={1.2} />
          </div>
        </div>
        <StudentExams id={user.id} home />
      </>
    );
  const config = await settings();
  const selection = { ...query, year: query.year === undefined ? config.year : query.year },
    x = filters(selection);
  const day = dayInTehran(),
    win = calendarWindow(day, 'month');
  await sweepExpired();
  const scope = sql`${x.school ? sql`AND c.school_id=${x.school}` : sql``} ${x.classId ? sql`AND c.id=${x.classId}` : sql``} ${x.year ? sql`AND c.year_id=${x.year}` : sql``}
 ${x.term ? sql`AND EXISTS(SELECT 1 FROM terms t WHERE t.id=${x.term} AND t.year_id=c.year_id)` : sql``}`;
  const [data, counts, attendance, examList, grades, todayEvents, monthEvents, upcoming, recent] =
    await Promise.all([
      catalog(),
      one<{ schools: number; classes: number; students: number }>(sql`SELECT
  (SELECT count(*)::int FROM schools s WHERE NOT s.archived ${x.school ? sql`AND s.id=${x.school}` : sql``}) schools,
  (SELECT count(*)::int FROM classes c JOIN schools s ON s.id=c.school_id WHERE NOT c.archived AND NOT s.archived ${scope}) classes,
  (SELECT count(DISTINCT e.student_id)::int FROM enrollments e JOIN students st ON st.id=e.student_id JOIN classes c ON c.id=e.class_id JOIN schools s ON s.id=c.school_id WHERE NOT st.archived AND NOT c.archived AND NOT s.archived AND e.starts<=${day}::date AND (e.ends IS NULL OR e.ends>${day}::date) ${scope}) students`),
      attendanceStats(selection),
      examStats(selection),
      gradeStats(selection),
      events(day, addDays(day, 1), x.school, x.classId),
      events(win.start, win.end, x.school, x.classId),
      events(day, addDays(day, 21), x.school, x.classId),
      rows<{ id: string; action: string; entity: string; at: Date }>(
        sql`SELECT id::text,action,entity,at FROM audit WHERE actor=${user.id} ORDER BY at DESC LIMIT 8`
      ),
    ]);
  const avg = grades.length
    ? localDigits(Math.round((grades.reduce((s, g) => s + g.mean, 0) / grades.length) * 10) / 10)
    : '—';
  const total = attendance.reduce((s, a) => s + a.total, 0),
    present = attendance.reduce((s, a) => s + a.present, 0);
  const stats = [
    { label: 'مدرسهٔ فعال', value: localDigits(counts?.schools ?? 0), Icon: School },
    { label: 'کلاس فعال', value: localDigits(counts?.classes ?? 0), Icon: Layers3 },
    { label: 'دانش‌آموز', value: localDigits(counts?.students ?? 0), Icon: GraduationCap },
    { label: 'میانگین نمره از ۲۰', value: avg, Icon: Activity },
  ];
  const next = upcoming.filter((e) => e.starts >= new Date()),
    exams = next.filter((e) => e.is_exam),
    tasks = next.filter((e) => ['task', 'reminder', 'meeting'].includes(e.kind)),
    pending = examList.filter((x) => x.pending);
  const actions: Record<string, string> = {
    create: 'ایجاد',
    save: 'ذخیره',
    edit: 'ویرایش',
    publish: 'انتشار',
    published: 'انتشار',
    grade: 'تصحیح',
    duplicate: 'رونوشت',
    transfer: 'انتقال',
    move: 'جابجایی',
    delete: 'حذف',
    archived: 'بایگانی',
    draft: 'پیش‌نویس',
    revoke: 'لغو انتشار',
    'password.change': 'تغییر رمز',
  };
  const entities: Record<string, string> = {
    school: 'مدرسه',
    class: 'کلاس',
    year: 'سال تحصیلی',
    term: 'نیمسال',
    student: 'دانش‌آموز',
    subject: 'درس',
    attendance: 'حضور و غیاب',
    event: 'رویداد',
    exam: 'آزمون',
    question: 'سؤال',
    attempt: 'برگهٔ آزمون',
    assessment: 'ارزیابی',
    result: 'نتیجه',
    settings: 'تنظیمات',
    user: 'حساب',
  };
  const monthTitle = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Tehran',
  }).format(new Date());
  return (
    <>
      <div className="hero">
        <div>
          <span className="overline">
            <BookOpen size={15} /> میز کار معلم
          </span>
          <h1>{user.name}، خوش آمدید</h1>
          <p>برنامهٔ تدریس امروز و وضعیت کلاس‌ها را در یک نگاه مرور کنید.</p>
          <div className="hero-actions row">
            <Link className="button" href="/attendance">
              <ClipboardCheck size={16} /> ثبت حضور و غیاب
            </Link>
            <Link className="button" href="/calendar">
              <CalendarDays size={16} /> تقویم کاری
            </Link>
          </div>
        </div>
        <div className="hero-art">
          <BookOpen size={65} strokeWidth={1.2} />
        </div>
      </div>
      <div className="stats">
        {stats.map(({ label, value, Icon }) => (
          <article className="stat" key={label}>
            <div className="stat-icon">
              <Icon size={21} />
            </div>
            <div>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          </article>
        ))}
      </div>
      <Panel title="محدودهٔ نمایش">
        <ReportFilter data={data} query={selection} />
      </Panel>
      <div className="two-col">
        <Panel
          title="روند حضور در کلاس‌ها"
          detail={
            total
              ? localDigits(Math.round((present / total) * 100)) + '٪ حضور در محدودهٔ انتخابی'
              : 'ثبت حضور، روند و درصد حضور را در اینجا نشان می‌دهد.'
          }
          action={
            <Link className="text-link" href="/reports">
              گزارش‌ها <ArrowLeft size={14} className="inline" />
            </Link>
          }
        >
          {attendance.length ? (
            <MetricsChart
              line
              metric="presence"
              data={attendance
                .slice(-12)
                .map((v) => ({
                  label: localDigits(jalaliInput(v.day).slice(5)),
                  value: Math.round((v.present / v.total) * 100),
                }))}
            />
          ) : (
            <Empty>هنوز سابقه‌ای در این محدوده ثبت نشده است.</Empty>
          )}
          <Table
            heads={['تاریخ', 'حاضر', 'غایب']}
            rows={attendance
              .slice(-3)
              .reverse()
              .map((x) => [jalali(x.day), localDigits(x.present), localDigits(x.absent)])}
          />
        </Panel>
        <Panel
          title="برنامهٔ امروز"
          detail={jalali(day)}
          action={
            <Link className="text-link" href="/calendar">
              مشاهدهٔ تقویم
            </Link>
          }
        >
          {todayEvents.length ? (
            <ul className="timeline">
              {todayEvents.map((x) => (
                <li key={x.id}>
                  <Link href={(x.is_exam ? '/exams/' : '/calendar/') + x.id}>{x.title}</Link>
                  <span className="badge">{timeLabel(x.starts)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>برنامه‌ای برای امروز ثبت نشده است.</Empty>
          )}
        </Panel>
      </div>
      <div className="two-col">
        <Panel title={'تقویم ' + monthTitle}>
          <CalendarGrid days={eventDays(monthEvents, win.days)} offset={win.offset} today={day} />
        </Panel>
        <div className="stack">
          <Panel
            title="آزمون‌های پیش رو"
            action={
              <Link className="text-link" href="/exams">
                <FileQuestion size={17} />
              </Link>
            }
          >
            <Table
              heads={['آزمون', 'آغاز']}
              rows={exams.slice(0, 6).map((e) => [
                <Link className="text-link" href={'/exams/' + e.id}>
                  {e.title}
                </Link>,
                jalali(e.starts, true),
              ])}
            />
          </Panel>
          <Panel title="کارها و یادآوری‌های پیش رو">
            <Table
              heads={['رویداد', 'زمان']}
              rows={tasks.slice(0, 6).map((e) => [
                <Link className="text-link" href={'/calendar/' + e.id}>
                  {e.title}
                </Link>,
                jalali(e.starts, true),
              ])}
            />
          </Panel>
        </div>
      </div>
      <div className="two-col">
        <Panel title="عملکرد آزمون‌ها" detail="میانگین آزمون‌ها بر مقیاس ۲۰.">
          {examList.some((e) => e.avg != null) ? (
            <MetricsChart
              metric="score"
              line
              data={examList
                .filter((e) => e.avg != null)
                .slice(0, 8)
                .reverse()
                .map((e) => ({
                  label: localDigits(jalaliInput(e.day).slice(5)),
                  value: Math.round(((e.avg ?? 0) / e.maximum) * 200) / 10,
                }))}
            />
          ) : (
            <Empty>آزمون تصحیح‌شده‌ای در محدوده وجود ندارد.</Empty>
          )}
          <Table
            heads={['در انتظار تصحیح', 'تعداد برگه']}
            rows={pending.slice(0, 5).map((e) => [
              <Link href={'/exams/' + e.id} className="text-link">
                {e.title}
              </Link>,
              localDigits(e.pending),
            ])}
          />
        </Panel>
        <Panel title="فعالیت‌های اخیر">
          <Table
            heads={['فعالیت', 'زمان']}
            rows={recent.map((r) => [
              (actions[r.action] ?? 'تغییر') + ' · ' + (entities[r.entity] ?? 'رکورد'),
              jalali(r.at, true),
            ])}
          />
        </Panel>
      </div>
    </>
  );
}
