import { Workbook } from 'exceljs';
import { NextRequest } from 'next/server';
import { identity, limit } from '@/lib/auth';
import { uuid } from '@/lib/forms';
import { sql, rows } from '@/lib/db';
import { studentReport, attendanceStats, absenceStats, examStats, gradeStats } from '@/lib/reporting';
import { jalali } from '@/lib/date';
import { statuses } from '@/lib/teacher';
import { groupMonth } from '@/lib/export-data';
type Row = (string | number | null | undefined)[];
export async function GET(req: NextRequest) {
  const user = await identity();
  if (!user || user.must_change) return new Response(null, { status: 401 });
  const q = Object.fromEntries(req.nextUrl.searchParams),
    type = q.type;
  if (user.role === 'student' && (type !== 'student' || q.student !== user.id))
    return new Response(null, { status: 403 });
  if (!(await limit('export:' + user.id, 24, 300))) return new Response(null, { status: 429 });
  const book = new Workbook();
  function section(name: string, labels: string[], data: Row[]) {
    const sheet = book.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    sheet.addRow(labels);
    sheet.addRows(data);
    sheet.columns.forEach((column) => (column.width = 25));
    const head = sheet.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5947B1' } };
  }
  if (type === 'student' && uuid.safeParse(q.student).success) {
    const data = await studentReport(q.student, user.role === 'teacher');
    if (!data.school) return new Response(null, { status: 404 });
    section(
      'مشخصات',
      ['نام', 'شناسه', 'مدرسه', 'کلاس'],
      [[data.school.name, data.school.code, data.school.school, data.school.class_name]]
    );
    section(
      'نمره‌ها',
      ['عنوان', 'درس', 'نیمسال', 'تاریخ', 'نمره', 'سقف', 'وزن', 'بازخورد'],
      data.grades.map((x) => [
        x.title,
        x.subject,
        x.year + ' · ' + x.term,
        jalali(x.day),
        x.score,
        x.maximum,
        x.weight,
        x.feedback,
      ])
    );
    section(
      'آزمون‌ها',
      ['آزمون', 'تلاش', 'تاریخ', 'نمره', 'سقف'],
      data.exams.map((x) => [x.title, x.attempt, jalali(x.day), x.score, x.maximum])
    );
    section(
      'حضور',
      ['تاریخ', 'درس', 'کلاس', 'وضعیت'],
      data.attendance.map((x) => [
        jalali(x.day),
        x.subject,
        x.class_name,
        statuses[x.status as keyof typeof statuses],
      ])
    );
  } else if (type === 'attendance' && uuid.safeParse(q.session).success) {
    const data = await rows<{
      name: string;
      code: string;
      status: keyof typeof statuses;
      note: string;
      day: string;
    }>(
      sql`SELECT u.name,s.code,a.status,a.note,h.day FROM attendance a JOIN attendance_sessions h ON h.id=a.session_id JOIN students s ON s.id=a.student_id JOIN users u ON u.id=s.id WHERE h.id=${q.session} ORDER BY u.name`
    );
    section(
      'حضور و غیاب',
      ['دانش‌آموز', 'شناسه', 'وضعیت', 'یادداشت', 'تاریخ'],
      data.map((x) => [x.name, x.code, statuses[x.status], x.note, jalali(x.day)])
    );
  } else if (type === 'students') {
    const val = (q.q ?? '').slice(0, 100);
    const data = await rows<{
      name: string;
      code: string;
      status: string;
      class_name: string;
      school: string;
      contact: string;
      guardian: string;
    }>(sql`
   SELECT u.name,s.code,s.status,c.name class_name,h.name school,s.contact,s.guardian FROM students s JOIN users u ON u.id=s.id LEFT JOIN enrollments e ON e.student_id=s.id AND e.ends IS NULL LEFT JOIN classes c ON c.id=e.class_id LEFT JOIN schools h ON h.id=c.school_id WHERE s.archived=${q.archived === '1'}
   ${uuid.safeParse(q.school).success ? sql`AND c.school_id=${q.school}` : sql``} ${uuid.safeParse(q.class).success ? sql`AND c.id=${q.class}` : sql``} ${val ? sql`AND (position(lower(${val}) in lower(u.name))>0 OR position(lower(${val}) in lower(s.code))>0 OR position(lower(${val}) in lower(u.login))>0)` : sql``} ORDER BY u.name LIMIT 10000`);
    section(
      'دانش‌آموزان',
      ['دانش‌آموز', 'شناسه', 'وضعیت', 'مدرسه', 'کلاس', 'تماس', 'سرپرست'],
      data.map((x) => [x.name, x.code, x.status, x.school, x.class_name, x.contact, x.guardian])
    );
  } else if (type === 'reports') {
    const [attendance, absence, exams, grades] = await Promise.all([
      attendanceStats(q),
      absenceStats(q),
      examStats(q),
      gradeStats(q),
    ]);
    section(
      'حضور',
      ['دوره', 'کل', 'حضور', 'غیبت', 'موجه', 'تأخیر', 'خروج'],
      groupMonth(attendance, q.group).map((x) => [
        x.label || jalali(x.day),
        x.total,
        x.present,
        x.absent,
        x.excused,
        x.late,
        x.early,
      ])
    );
    section(
      'غیبت',
      ['دانش‌آموز', 'کل', 'غیبت', 'پیاپی'],
      absence.map((x) => [x.name, x.total, x.absent, x.streak])
    );
    section(
      'آزمون',
      ['آزمون', 'تاریخ', 'تلاش', 'در انتظار', 'میانگین', 'بیشترین', 'کمترین', 'قبول'],
      exams.map((x) => [x.title, jalali(x.day), x.cnt, x.pending, x.avg, x.high, x.low, x.passed])
    );
    section(
      'نمره',
      ['دانش‌آموز', 'کلاس', 'تعداد', 'میانگین از ۲۰'],
      grades.map((x) => [x.name, x.class_name, x.cnt, x.mean])
    );
  } else return new Response(null, { status: 400 });
  const bytes = await book.xlsx.writeBuffer();
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="teacher-report.xlsx"',
      'Cache-Control': 'private, no-store',
    },
  });
}
