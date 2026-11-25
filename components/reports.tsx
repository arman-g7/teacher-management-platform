import { groupMonth } from '@/lib/export-data';
import Link from 'next/link';
import {
  attendanceStats,
  absenceStats,
  examStats,
  gradeStats,
  studentReport,
  type Search,
} from '@/lib/reporting';
import { settings, type Catalog } from '@/lib/catalog';
import { jalali, jalaliInput, localDigits } from '@/lib/date';
import { statuses } from '@/lib/teacher';
import { Heading, pathFor } from './admin-records';
import { Panel, Select, Table, Empty, choices } from './forms';
import { Print, JalaliField } from './controls';
import { MetricsChart } from './charts';
const n = (v: number | string | null | undefined) => (v == null ? '—' : localDigits(Number(v)));
const pct = (v: number, total: number) => (total ? localDigits(Math.round((100 * v) / total)) + '٪' : '—');
export function ReportFilter({
  data,
  query,
  group = false,
}: {
  data: Catalog;
  query: Search;
  group?: boolean;
}) {
  return (
    <form className="filter no-print">
      <Select label="مدرسه" name="school" choices={data.schools} value={query.school} blank="همه" />
      <Select label="کلاس" name="class" choices={data.classes} value={query.class} blank="همه" />
      <Select label="سال تحصیلی" name="year" choices={data.years} value={query.year} blank="همه" />
      <Select label="نیمسال" name="term" choices={data.terms} value={query.term} blank="همه" />
      <JalaliField name="from" label="از تاریخ" value={query.from} required={false} />
      <JalaliField name="to" label="تا تاریخ" value={query.to} required={false} />
      {group && (
        <Select
          label="دورهٔ گزارش"
          name="group"
          choices={choices({ day: 'روزانه', week: 'هفتگی', month: 'ماهانه', semester: 'نیمسال' })}
          value={query.group || 'day'}
        />
      )}
      <button className="button primary">اعمال فیلتر</button>
    </form>
  );
}
export async function Reports({ data, query }: { data: Catalog; query: Search }) {
  const [attendance, absences, exams, grades, config] = await Promise.all([
    attendanceStats(query),
    absenceStats(query),
    examStats(query),
    gradeStats(query),
    settings(),
  ]);
  const summary = groupMonth(attendance, query.group);
  const dist = [0, 0, 0, 0, 0];
  for (const g of grades) dist[Math.min(4, Math.floor(g.mean / 4))]++;
  return (
    <>
      <Heading
        title="مرکز گزارش‌ها"
        description="عملکرد تحصیلی و وضعیت حضور را در سطح مدرسه یا کلاس بررسی کنید."
        action={
          <div className="row">
            <Print />
            <a className="button outline" href={pathFor('/api/export', { ...query, type: 'reports' })}>
              خروجی اکسل
            </a>
          </div>
        }
      />
      <Panel title="محدودهٔ گزارش">
        <ReportFilter data={data} query={query} group />
        <div className="print-only">{config.header}</div>
      </Panel>
      <div className="two-col">
        <Panel title="روند حضور">
          {summary.length ? (
            <MetricsChart
              metric="presence"
              line
              data={summary
                .slice(-12)
                .map((x) => ({
                  label: x.label || localDigits(jalaliInput(x.day).slice(5)),
                  value: Math.round((100 * x.present) / x.total),
                }))}
            />
          ) : (
            <Empty>دادهٔ حضور برای این محدوده وجود ندارد.</Empty>
          )}
        </Panel>
        <Panel title="توزیع میانگین‌های کلاسی">
          {grades.length ? (
            <MetricsChart
              metric="count"
              data={dist.map((value, i) => ({
                label: localDigits(i * 4) + ' تا ' + localDigits((i + 1) * 4),
                value,
              }))}
            />
          ) : (
            <Empty>دادهٔ نمره برای این محدوده وجود ندارد.</Empty>
          )}
        </Panel>
      </div>
      <Panel title="گزارش حضور و غیاب">
        <Table
          heads={['دوره', 'کل ثبت‌ها', 'حضور', 'غیبت', 'موجه', 'تأخیر', 'خروج', 'درصد حضور']}
          rows={[...summary]
            .reverse()
            .map((x) => [
              x.label || jalali(x.day),
              n(x.total),
              n(x.present),
              n(x.absent),
              n(x.excused),
              n(x.late),
              n(x.early),
              pct(x.present, x.total),
            ])}
        />
      </Panel>
      <Panel
        title="غیبت دانش‌آموزان"
        detail="دانش‌آموزان دارای بیشترین غیبت و تعداد غیبت پیاپی از آخرین جلسه."
      >
        <Table
          heads={['دانش‌آموز', 'کل ثبت‌ها', 'غیبت', 'پیاپی', 'درصد غیبت']}
          rows={absences.map((x) => [
            <Link className="text-link" href={'/students/' + x.id}>
              {x.name}
            </Link>,
            n(x.total),
            n(x.absent),
            n(x.streak),
            pct(x.absent, x.total),
          ])}
        />
      </Panel>
      <Panel title="کارنامهٔ آزمون‌ها">
        <Table
          heads={[
            'آزمون',
            'تاریخ',
            'تلاش تصحیح‌شده',
            'در انتظار',
            'میانگین',
            'بیشترین',
            'کمترین',
            'قبولی',
            'مردودی',
          ]}
          rows={exams.map((x) => [
            <Link className="text-link" href={'/exams/' + x.id}>
              {x.title}
            </Link>,
            jalali(x.day),
            n(x.cnt),
            n(x.pending),
            n(x.avg),
            n(x.high),
            n(x.low),
            pct(x.passed, x.cnt),
            pct(x.cnt - x.passed, x.cnt),
          ])}
        />
      </Panel>
      <Panel title="رتبه‌بندی دفتر نمره" detail="رتبه در هر کلاس بر اساس میانگین وزنی از ۲۰ محاسبه می‌شود.">
        <RankTable data={grades} />
      </Panel>
      {config.footer && <div className="print-only">{config.footer}</div>}
    </>
  );
}
function RankTable({ data }: { data: Awaited<ReturnType<typeof gradeStats>> }) {
  const ranked = new Map<string, { score: number; rank: number }>();
  return (
    <Table
      heads={['رتبه', 'دانش‌آموز', 'کلاس', 'ارزیابی‌ها', 'میانگین وزنی']}
      rows={data.map((v) => {
        const old = ranked.get(v.class_id);
        const rank = old?.score === v.mean ? old.rank : (old?.rank ?? 0) + 1;
        ranked.set(v.class_id, { score: v.mean, rank });
        return [
          n(rank),
          <Link className="text-link" href={'/students/' + v.id}>
            {v.name}
          </Link>,
          v.class_name,
          n(v.cnt),
          n(v.mean),
        ];
      })}
    />
  );
}
export async function StudentReport({ id, teacher = false }: { id: string; teacher?: boolean }) {
  const [data, config] = await Promise.all([studentReport(id, teacher), settings()]);
  const scale = config.grading ?? 20;
  const buckets = new Map<string, { label: string; weight: number; sum: number }>();
  for (const grade of data.grades) {
    const entry = buckets.get(grade.term_id) ?? { label: grade.year + ' · ' + grade.term, weight: 0, sum: 0 };
    entry.weight += grade.weight;
    entry.sum += (grade.score / grade.maximum) * grade.weight;
    buckets.set(grade.term_id, entry);
  }
  const total = data.attendance.length;
  const present = data.attendance.filter((x) => ['present', 'late', 'early'].includes(x.status)).length;
  return (
    <>
      <Panel
        title={config.header || 'کارنامهٔ تحصیلی'}
        detail={[data.school?.name, data.school?.school, data.school?.class_name, data.school?.level]
          .filter(Boolean)
          .join(' · ')}
        action={
          <div className="row">
            <Print />
            <a className="button outline" href={pathFor('/api/export', { type: 'student', student: id })}>
              اکسل کارنامه
            </a>
          </div>
        }
      >
        {data.school && (
          <p>
            شناسهٔ دانش‌آموزی {localDigits(data.school.code)}{' '}
            {data.school.contact && ' · تماس ' + localDigits(data.school.contact)}
          </p>
        )}
        <div className="two-col">
          <div>
            {data.grades.length > 0 && (
              <MetricsChart
                metric="score"
                line
                data={data.grades
                  .slice(0, 12)
                  .reverse()
                  .map((v) => ({
                    label: localDigits(jalaliInput(v.day).slice(5)),
                    value: Math.round((v.score / v.maximum) * scale * 100) / 100,
                  }))}
              />
            )}
          </div>
          <div>
            <Table
              heads={['نیمسال', 'میانگین وزنی از ' + n(scale)]}
              rows={[...buckets.values()].map((v) => [
                v.label,
                n(Math.round((v.sum / v.weight) * scale * 100) / 100),
              ])}
            />
          </div>
        </div>
        <Table
          heads={['ارزیابی', 'درس', 'نیمسال', 'تاریخ', 'نمره', 'وزن', 'بازخورد']}
          rows={data.grades.map((x) => [
            x.title,
            x.subject,
            x.term,
            jalali(x.day),
            n(x.score) + ' / ' + n(x.maximum),
            n(x.weight),
            x.feedback || '—',
          ])}
        />
        {teacher && config.signature && (
          <img className="report-sign" src={'/api/files/' + config.signature} alt="امضای معلم" />
        )}
        {config.footer && <p>{config.footer}</p>}
      </Panel>
      <div className="two-col">
        <Panel title="آزمون‌ها">
          <Table
            heads={['آزمون', 'تلاش', 'تاریخ', 'نمره']}
            rows={data.exams.map((x) => [
              <Link className="text-link" href={(teacher ? '/exams/' : '/take/') + x.exam}>
                {x.title}
              </Link>,
              n(x.attempt),
              jalali(x.day),
              n(x.score) + ' / ' + n(x.maximum),
            ])}
          />
        </Panel>
        <Panel title="سابقهٔ عضویت">
          <Table
            heads={['مدرسه', 'کلاس', 'از', 'تا']}
            rows={data.history.map((x) => [
              x.school,
              x.class_name,
              jalali(x.start),
              x.end ? jalali(x.end) : 'جاری',
            ])}
          />
        </Panel>
      </div>
      <Panel title="سابقهٔ حضور" detail={'درصد حضور ' + pct(present, total)}>
        <Table
          heads={teacher ? ['تاریخ', 'درس', 'کلاس', 'وضعیت', 'یادداشت'] : ['تاریخ', 'درس', 'کلاس', 'وضعیت']}
          rows={data.attendance.map((x) => [
            jalali(x.day),
            x.subject,
            x.class_name,
            statuses[x.status as keyof typeof statuses],
            ...(teacher ? [x.note || '—'] : []),
          ])}
        />
      </Panel>
    </>
  );
}
