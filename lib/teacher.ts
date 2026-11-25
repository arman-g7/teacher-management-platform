import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { User } from './auth';
import { loginName, password } from './auth';
import { db, rows, one, sql, json, audit, type Executor } from './db';
import { field, optional, id, date, timestamp, digit, checked, fail, parseJson } from './forms';
import { hashPassword } from './password';
import { dayInTehran } from './date';

export const statuses = {
  present: 'حاضر',
  absent: 'غایب',
  excused: 'غیبت موجه',
  late: 'تأخیر',
  early: 'خروج زودهنگام',
} as const;
export const eventKinds = {
  lesson: 'تدریس',
  meeting: 'جلسه',
  task: 'کار',
  reminder: 'یادآوری',
  holiday: 'تعطیلی',
  exam: 'آزمون',
} as const;
export const assessmentKinds = {
  assignment: 'تکلیف',
  activity: 'فعالیت کلاسی',
  midterm: 'میان‌ترم',
  final: 'پایان‌ترم',
} as const;
export const classScope = (classId: string) =>
  one<{ id: string; school_id: string; year_id: string; starts: string; ends: string }>(
    sql`SELECT c.id,c.school_id,c.year_id,y.starts,y.ends FROM classes c JOIN schools s ON s.id=c.school_id JOIN years y ON y.id=c.year_id WHERE c.id=${classId} AND NOT c.archived AND NOT s.archived`
  );
export const roster = (classId: string, day: string, tx?: Executor) =>
  rows<{ id: string; student_id: string; name: string; code: string }>(
    sql`SELECT e.id,e.student_id,u.name,s.code FROM enrollments e JOIN students s ON s.id=e.student_id JOIN users u ON u.id=s.id
 WHERE e.class_id=${classId} AND e.starts<=${day} AND (e.ends IS NULL OR e.ends>${day}) AND (s.archived_on IS NULL OR s.archived_on>=${day}::date) ORDER BY u.name`,
    tx
  );

function within(day: string, row: { starts: string; ends: string }) {
  if (day < row.starts || day > row.ends) fail('تاریخ خارج از محدودهٔ دوره است.');
}
async function image(id: string | null, user: string) {
  if (id && !(await one(sql`SELECT 1 FROM files WHERE id=${id} AND owner=${user} AND mime LIKE 'image/%'`)))
    fail('تصویر معتبر نیست.');
  return id;
}
const studentSchema = z.object({
  login: loginName,
  password,
  code: z.string().trim().min(1).max(50),
  first: z.string().trim().min(1).max(80),
  last: z.string().trim().min(1).max(80),
  contact: z.string().trim().max(100).default(''),
  guardian: z.string().trim().max(100).default(''),
  notes: z.string().max(3000).default(''),
});
async function createStudent(
  tx: Executor,
  data: z.infer<typeof studentSchema>,
  hash: string,
  cls: string,
  day: string,
  actor: string
) {
  const user = (await one<{ id: string }>(
    sql`INSERT INTO users(role,login,name,password,must_change) VALUES ('student',${data.login},${data.first + ' ' + data.last},${hash},true) RETURNING id`,
    tx
  ))!;
  await tx.execute(
    sql`INSERT INTO students(id,code,first_name,last_name,contact,guardian,notes) VALUES (${user.id},${data.code},${data.first},${data.last},${data.contact},${data.guardian},${data.notes})`
  );
  await tx.execute(
    sql`INSERT INTO enrollments(student_id,class_id,starts) VALUES (${user.id},${cls},${day})`
  );
  await audit(tx, actor, 'create', 'student', user.id);
}
export type Operation = (form: FormData, user: User) => Promise<void>;
export const operations: Record<string, Operation> = {
  async school(form, user) {
    const key = optional(form, 'id', 36) ? id(form) : randomUUID(),
      name = field(form, 'name', 120),
      address = optional(form, 'address', 400),
      phone = optional(form, 'phone', 60);
    const logo = await image(optional(form, 'logo', 36) ? id(form, 'logo') : null, user.id);
    await db.transaction(async (tx) => {
      await tx.execute(sql`INSERT INTO schools(id,name,address,phone,logo,archived) VALUES (${key},${name},${address},${phone},${logo},${checked(form, 'archived')})
     ON CONFLICT(id) DO UPDATE SET name=excluded.name,address=excluded.address,phone=excluded.phone,logo=coalesce(excluded.logo,schools.logo),archived=excluded.archived`);
      await audit(tx, user.id, 'save', 'school', key);
    });
  },
  async year(form, user) {
    const school = id(form, 'school'),
      name = field(form, 'name', 80),
      start = date(form, 'start'),
      end = date(form, 'end');
    if (!(await one(sql`SELECT 1 FROM schools WHERE id=${school} AND NOT archived`)))
      fail('مدرسه فعال نیست.');
    await db.transaction(async (tx) => {
      const y = (await one<{ id: string }>(
        sql`INSERT INTO years(school_id,name,starts,ends) VALUES (${school},${name},${start},${end}) RETURNING id`,
        tx
      ))!;
      await audit(tx, user.id, 'create', 'year', y.id);
    });
  },
  async term(form, user) {
    const year = id(form, 'year'),
      name = field(form, 'name', 80),
      start = date(form, 'start'),
      end = date(form, 'end');
    const y =
      (await one<{ starts: string; ends: string }>(sql`SELECT starts,ends FROM years WHERE id=${year}`)) ??
      fail('سال پیدا نشد.');
    within(start, y);
    within(end, y);
    await db.transaction(async (tx) => {
      const item = (await one<{ id: string }>(
        sql`INSERT INTO terms(year_id,name,starts,ends) VALUES (${year},${name},${start},${end}) RETURNING id`,
        tx
      ))!;
      await audit(tx, user.id, 'create', 'term', item.id);
    });
  },
  async class(form, user) {
    const key = optional(form, 'id', 36) ? id(form) : randomUUID(),
      year = id(form, 'year'),
      name = field(form, 'name', 80),
      level = field(form, 'level', 60);
    await db.transaction(async (tx) => {
      const item = await one(
        sql`INSERT INTO classes(id,school_id,year_id,name,level,archived)
    SELECT ${key},school_id,id,${name},${level},${checked(form, 'archived')} FROM years WHERE id=${year}
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,level=excluded.level,archived=excluded.archived WHERE classes.year_id=excluded.year_id RETURNING id`,
        tx
      );
      if (!item) fail('سال تحصیلی معتبر نیست.');
      await audit(tx, user.id, 'save', 'class', key);
    });
  },
  async subject(form, user) {
    const school = id(form, 'school'),
      name = field(form, 'name', 80);
    await db.transaction(async (tx) => {
      const item = (await one<{ id: string }>(
        sql`INSERT INTO subjects(school_id,name) VALUES (${school},${name}) RETURNING id`,
        tx
      ))!;
      await audit(tx, user.id, 'create', 'subject', item.id);
    });
  },
  async student(form, user) {
    const cls = id(form, 'class'),
      day = date(form, 'day'),
      scope = (await classScope(cls)) ?? fail('کلاس فعال پیدا نشد.');
    within(day, scope);
    const parsed = studentSchema.parse(Object.fromEntries(form));
    const hash = await hashPassword(parsed.password);
    await db.transaction((tx) => createStudent(tx, parsed, hash, cls, day, user.id));
  },
  async importStudents(form, user) {
    const cls = id(form, 'class'),
      day = date(form, 'day'),
      scope = (await classScope(cls)) ?? fail('کلاس فعال پیدا نشد.');
    within(day, scope);
    const data = z
      .array(studentSchema)
      .min(1)
      .max(100)
      .parse(parseJson(field(form, 'payload', 140000)));
    const hashes: string[] = [];
    for (const student of data) hashes.push(await hashPassword(student.password));
    await db.transaction(async (tx) => {
      for (const [index, student] of data.entries())
        await createStudent(tx, student, hashes[index], cls, day, user.id);
    });
  },
  async studentEdit(form, user) {
    const student = id(form),
      first = field(form, 'first', 80),
      last = field(form, 'last', 80),
      contact = optional(form, 'contact', 100),
      guardian = optional(form, 'guardian', 100),
      notes = optional(form, 'notes', 3000),
      status = field(form, 'status', 60),
      archived = checked(form, 'archived'),
      active = checked(form, 'active') && !archived;
    const next = z
        .string()
        .max(128)
        .parse(form.get('password') ?? ''),
      nextHash = next ? await hashPassword(password.parse(next)) : null;
    const photo = await image(optional(form, 'photo', 36) ? id(form, 'photo') : null, user.id);
    await db.transaction(async (tx) => {
      const changed = await one(
        sql`UPDATE students SET first_name=${first},last_name=${last},contact=${contact},guardian=${guardian},notes=${notes},status=${status},archived=${archived},archived_on=CASE WHEN ${archived} THEN coalesce(archived_on,${dayInTehran()}::date) ELSE NULL END WHERE id=${student} RETURNING id`,
        tx
      );
      if (!changed) fail('دانش‌آموز پیدا نشد.');
      await tx.execute(
        sql`UPDATE users SET name=${first + ' ' + last},photo=coalesce(${photo},photo),active=${active},password=coalesce(${nextHash},password),must_change=CASE WHEN ${!!nextHash} THEN true ELSE must_change END WHERE id=${student}`
      );
      if (!active || nextHash) await tx.execute(sql`DELETE FROM sessions WHERE user_id=${student}`);
      await audit(tx, user.id, 'edit', 'student', student, { archived, active, passwordReset: !!nextHash });
    });
  },
  async transfer(form, user) {
    const student = id(form),
      cls = id(form, 'class'),
      day = date(form, 'day'),
      scope = (await classScope(cls)) ?? fail('کلاس فعال پیدا نشد.');
    within(day, scope);
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(3162111)`);
      if (!(await one(sql`SELECT id FROM students WHERE id=${student} AND NOT archived FOR UPDATE`, tx)))
        fail('دانش‌آموز فعال نیست.');
      const current = await one<{ id: string; class_id: string; starts: string }>(
        sql`SELECT id,class_id,starts FROM enrollments WHERE student_id=${student} AND ends IS NULL FOR UPDATE`,
        tx
      );
      if (current) {
        if (current.class_id === cls || day <= current.starts) fail('کلاس مقصد یا تاریخ انتقال معتبر نیست.');
        const later = await one(
          sql`SELECT 1 FROM attendance a JOIN attendance_sessions h ON h.id=a.session_id WHERE a.enrollment_id=${current.id} AND h.day>=${day}
     UNION ALL SELECT 1 FROM grades g JOIN assessments x ON x.id=g.assessment_id WHERE g.enrollment_id=${current.id} AND x.day>=${day} LIMIT 1`,
          tx
        );
        if (later) fail('تاریخ انتقال باید بعد از سوابق ثبت‌شده باشد.');
        await tx.execute(sql`UPDATE enrollments SET ends=${day} WHERE id=${current.id}`);
      }
      await tx.execute(
        sql`INSERT INTO enrollments(student_id,class_id,starts) VALUES (${student},${cls},${day})`
      );
      await audit(tx, user.id, 'transfer', 'student', student, { class: cls, day });
    });
  },
  async attendance(form, user) {
    const cls = id(form, 'class'),
      subject = id(form, 'subject'),
      day = date(form, 'day'),
      slot = digit(form, 'slot', 1, 20, true),
      scope = (await classScope(cls)) ?? fail('کلاس فعال پیدا نشد.');
    within(day, scope);
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(3162111)`);
      const session = (await one<{ id: string }>(
        sql`INSERT INTO attendance_sessions(school_id,class_id,subject_id,day,slot) VALUES (${scope.school_id},${cls},${subject},${day},${slot})
    ON CONFLICT(class_id,subject_id,day,slot) DO UPDATE SET slot=excluded.slot RETURNING id`,
        tx
      ))!;
      const rosterItems = await roster(cls, day, tx);
      if (!rosterItems.length) fail('در این تاریخ دانش‌آموزی در کلاس ثبت نشده است.');
      const before = await rows(
        sql`SELECT student_id,status,note FROM attendance WHERE session_id=${session.id} ORDER BY student_id`,
        tx
      );
      const after = [];
      for (const student of rosterItems) {
        const status = z
          .enum(['present', 'absent', 'excused', 'late', 'early'])
          .parse(form.get('status_' + student.student_id));
        const note = optional(form, 'note_' + student.student_id, 300);
        await tx.execute(sql`INSERT INTO attendance(session_id,class_id,student_id,enrollment_id,status,note) VALUES (${session.id},${cls},${student.student_id},${student.id},${status},${note})
       ON CONFLICT(session_id,student_id) DO UPDATE SET status=excluded.status,note=excluded.note`);
        after.push({ student_id: student.student_id, status, note });
        if (status === 'absent') {
          await tx.execute(
            sql`INSERT INTO notifications(user_id,topic,title,path) SELECT id,${'absence:' + session.id + ':' + student.student_id},${'غیبت ثبت شد · ' + student.name},'/attendance' FROM users WHERE role='teacher' ON CONFLICT DO NOTHING`
          );
        } else
          await tx.execute(
            sql`DELETE FROM notifications WHERE topic=${'absence:' + session.id + ':' + student.student_id}`
          );
      }
      await audit(tx, user.id, 'save', 'attendance', session.id, { before, after });
    });
  },
  async event(form, user) {
    const key = optional(form, 'id', 36) ? id(form) : null;
    const kind = z.enum(['lesson', 'meeting', 'task', 'reminder', 'holiday', 'exam']).parse(form.get('kind')),
      title = field(form, 'title', 140);
    const start = timestamp(form, 'start'),
      end = timestamp(form, 'end'),
      school = optional(form, 'school', 36) ? id(form, 'school') : null,
      cls = optional(form, 'class', 36) ? id(form, 'class') : null;
    if (end <= start) fail('پایان رویداد باید بعد از شروع باشد.');
    const count = key ? 1 : digit(form, 'repeat', 1, 24, true),
      reminder = digit(form, 'reminder', 0, 10080, true);
    const color = z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .parse(form.get('color'));
    const series = randomUUID();
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(3162110)`);
      for (let i = 0; i < count; i++) {
        const from = new Date(start.getTime() + i * 604800000),
          to = new Date(end.getTime() + i * 604800000);
        if (
          kind !== 'holiday' &&
          (await one(
            sql`SELECT 1 FROM events WHERE kind<>'holiday' AND starts<${to} AND ends>${from} AND id IS DISTINCT FROM ${key}::uuid
      UNION ALL SELECT 1 FROM exams WHERE state='published' AND starts<${to} AND ends>${from} LIMIT 1`,
            tx
          ))
        )
          fail('این بازه با برنامهٔ دیگری تداخل دارد.');
        const eventId = key ?? randomUUID();
        await tx.execute(sql`INSERT INTO events(id,school_id,class_id,title,kind,starts,ends,color,reminder,series)
    VALUES (${eventId},${school},${cls},${title},${kind},${from},${to},${color},${reminder},${series})
    ON CONFLICT(id) DO UPDATE SET school_id=excluded.school_id,class_id=excluded.class_id,title=excluded.title,kind=excluded.kind,starts=excluded.starts,ends=excluded.ends,color=excluded.color,reminder=excluded.reminder`);
        await audit(tx, user.id, 'save', 'event', eventId);
      }
    });
  },
  async eventDelete(form, user) {
    const key = id(form);
    await db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM events WHERE id=${key}`);
      await audit(tx, user.id, 'delete', 'event', key);
    });
  },
  async assessment(form, user) {
    const cls = id(form, 'class'),
      scope = (await classScope(cls)) ?? fail('کلاس فعال نیست.'),
      term = id(form, 'term'),
      subject = id(form, 'subject'),
      day = date(form, 'day'),
      title = field(form, 'title', 140);
    const kind = z.enum(['assignment', 'activity', 'midterm', 'final']).parse(form.get('kind')),
      maximum = digit(form, 'maximum', 0.01, 10000),
      weight = digit(form, 'weight', 0.01, 1000);
    const period =
      (await one<{ starts: string; ends: string }>(
        sql`SELECT starts,ends FROM terms WHERE id=${term} AND year_id=${scope.year_id}`
      )) ?? fail('نیمسال برای این کلاس معتبر نیست.');
    within(day, period);
    await db.transaction(async (tx) => {
      const item = (await one<{ id: string }>(
        sql`INSERT INTO assessments(class_id,school_id,year_id,term_id,subject_id,title,kind,maximum,weight,day) VALUES(${cls},${scope.school_id},${scope.year_id},${term},${subject},${title},${kind},${maximum},${weight},${day}) RETURNING id`,
        tx
      ))!;
      await audit(tx, user.id, 'create', 'assessment', item.id);
    });
  },
  async gradebook(form, user) {
    const key = id(form);
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(3162111)`);
      const assessment =
        (await one<{ class_id: string; day: string; maximum: string }>(
          sql`SELECT class_id,day,maximum FROM assessments WHERE id=${key} FOR UPDATE`,
          tx
        )) ?? fail('ارزیابی پیدا نشد.');
      const before = await rows(
        sql`SELECT student_id,score,feedback FROM grades WHERE assessment_id=${key}`,
        tx
      );
      for (const student of await roster(assessment.class_id, assessment.day, tx)) {
        const scoreKey = 'score_' + student.student_id;
        if (!form.has(scoreKey)) fail('فهرست کلاس تغییر کرده است. دوباره بارگذاری کنید.');
        if (!optional(form, scoreKey, 20)) {
          await tx.execute(
            sql`DELETE FROM grades WHERE assessment_id=${key} AND student_id=${student.student_id}`
          );
          continue;
        }
        const score = digit(form, scoreKey, 0, Number(assessment.maximum)),
          feedback = optional(form, 'feedback_' + student.student_id, 500);
        await tx.execute(sql`INSERT INTO grades(assessment_id,class_id,student_id,enrollment_id,score,feedback) VALUES(${key},${assessment.class_id},${student.student_id},${student.id},${score},${feedback})
      ON CONFLICT(assessment_id,student_id) DO UPDATE SET score=excluded.score,feedback=excluded.feedback`);
      }
      await tx.execute(sql`UPDATE assessments SET published=${checked(form, 'published')} WHERE id=${key}`);
      await audit(tx, user.id, 'grade', 'assessment', key, {
        before,
        after: await rows(sql`SELECT student_id,score,feedback FROM grades WHERE assessment_id=${key}`, tx),
      });
    });
  },
  async settings(form, user) {
    const data = {
      title: field(form, 'title', 80),
      header: optional(form, 'header', 160),
      footer: optional(form, 'footer', 160),
      grading: digit(form, 'grading', 1, 1000),
      minutes: digit(form, 'minutes', 1, 480, true),
      notifications: checked(form, 'notifications'),
      theme: z.enum(['light', 'dark', 'system']).parse(form.get('theme')),
      year: optional(form, 'year', 36) ? id(form, 'year') : null,
      logo: await image(optional(form, 'logo', 36) ? id(form, 'logo') : null, user.id),
      signature: await image(optional(form, 'signature', 36) ? id(form, 'signature') : null, user.id),
    };
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`UPDATE settings SET data=data||${json(data)}||jsonb_strip_nulls(jsonb_build_object('logo',coalesce(${data.logo}::text,data->>'logo'),'signature',coalesce(${data.signature}::text,data->>'signature'))) `
      );
      await audit(tx, user.id, 'save', 'settings', 'singleton');
    });
  },
};
operations.eventMove = async (form, user) => {
  const key = id(form),
    day = date(form, 'day');
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(3162110)`);
    const item =
      (await one<{ starts: Date; ends: Date; kind: string }>(
        sql`SELECT starts,ends,kind FROM events WHERE id=${key} FOR UPDATE`,
        tx
      )) ?? fail('رویداد پیدا نشد.');
    const range = (await one<{ starts: Date; ends: Date }>(
      sql`SELECT ((${day}::date + (${item.starts}::timestamptz AT TIME ZONE 'Asia/Tehran')::time) AT TIME ZONE 'Asia/Tehran') starts,
    ((${day}::date + (${item.starts}::timestamptz AT TIME ZONE 'Asia/Tehran')::time) AT TIME ZONE 'Asia/Tehran') + (${item.ends}::timestamptz-${item.starts}::timestamptz) ends`,
      tx
    ))!;
    if (
      item.kind !== 'holiday' &&
      (await one(
        sql`SELECT 1 FROM events WHERE id<>${key} AND kind<>'holiday' AND starts<${range.ends} AND ends>${range.starts}
   UNION ALL SELECT 1 FROM exams WHERE state='published' AND starts<${range.ends} AND ends>${range.starts} LIMIT 1`,
        tx
      ))
    )
      fail('این بازه با برنامهٔ دیگری تداخل دارد.');
    await tx.execute(sql`UPDATE events SET starts=${range.starts},ends=${range.ends} WHERE id=${key}`);
    await audit(tx, user.id, 'move', 'event', key, { from: item.starts, to: range.starts });
  });
};
