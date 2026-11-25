import type { SQL } from 'drizzle-orm';
import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';
import { db, sql, rows, one, json, audit, type Executor } from './db';
import { classScope, roster, type Operation } from './teacher';
import { id, optional, field, digit, date, timestamp, checked, fail, uuid, parseJson } from './forms';
import {
  definitionSchema,
  kindSchema,
  validDefinition,
  validAnswer,
  grade,
  manual,
  round,
  type Kind,
  type Definition,
} from './scoring';
import { dayInTehran } from './date';
import { hashPassword, verifyPassword } from './password';
export type Exam = {
  id: string;
  class_id: string;
  school_id: string;
  subject_id: string;
  title: string;
  description: string;
  instructions: string;
  starts: Date;
  ends: Date;
  publish_at: Date;
  minutes: number;
  passing: string;
  max_attempts: number;
  shuffle: boolean;
  shuffle_options: boolean;
  negative: boolean;
  reveal: boolean;
  code_hash: string | null;
  state: 'draft' | 'published' | 'archived';
  results_at: Date | null;
};
export type Question = { id: string; kind: Kind; prompt: string; definition: Definition; position: number };
type Layout = { id: string; options: number[]; right: number[] };
export type Attempt = {
  id: string;
  exam_id: string;
  student_id: string;
  ordinal: number;
  started_at: Date;
  deadline: Date;
  layout: Layout[];
  submitted_at: Date | null;
  finalized: boolean;
  score: string | null;
};
const ids = z.array(uuid).min(1).max(100);
const questionInput = z.object({
  kind: kindSchema,
  prompt: z.string().trim().min(1).max(12000),
  chapter: z.string().trim().max(100).default(''),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  tags: z.string().max(250).default(''),
  definition: definitionSchema,
});
export const examQuestions = (exam: string, tx?: Executor) =>
  rows<Question>(
    sql`SELECT id,kind,prompt,definition,position FROM exam_questions WHERE exam_id=${exam} ORDER BY position`,
    tx
  );
const config = (form: FormData) => ({
  title: field(form, 'title', 180),
  description: optional(form, 'description', 5000),
  instructions: optional(form, 'instructions', 6000),
  starts: timestamp(form, 'start'),
  ends: timestamp(form, 'end'),
  publish: optional(form, 'publish', 10) ? timestamp(form, 'publish') : new Date(),
  minutes: digit(form, 'minutes', 1, 480, true),
  passing: digit(form, 'passing', 0, 10000),
  attempts: digit(form, 'attempts', 1, 10, true),
  shuffle: checked(form, 'shuffle'),
  shuffleOptions: checked(form, 'shuffleOptions'),
  negative: checked(form, 'negative'),
  reveal: checked(form, 'reveal'),
});
async function bankSave(
  tx: Executor,
  actor: string,
  subject: string,
  item: z.infer<typeof questionInput>,
  key: string | null,
  archived: boolean
) {
  const def = {
    ...item.definition,
    points: round(item.definition.points),
    penalty: round(item.definition.penalty),
  };
  if (!validDefinition(item.kind, def) || def.points <= 0) fail('پاسخ‌نامه یا گزینه‌های سؤال معتبر نیست.');
  if (
    def.attachment &&
    !(await one(sql`SELECT 1 FROM files WHERE id=${def.attachment} AND owner=${actor}`, tx))
  )
    fail('پیوست معتبر نیست.');
  const fingerprint = createHash('sha256')
    .update(item.prompt.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim())
    .digest('hex');
  const saved = await one<{ id: string }>(
    sql`INSERT INTO questions(id,subject_id,kind,prompt,chapter,difficulty,tags,definition,fingerprint,archived)
 VALUES(coalesce(${key}::uuid,gen_random_uuid()),${subject},${item.kind},${item.prompt},${item.chapter},${item.difficulty},${item.tags},${json(def)},${fingerprint},${archived})
 ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,prompt=excluded.prompt,chapter=excluded.chapter,difficulty=excluded.difficulty,tags=excluded.tags,definition=excluded.definition,fingerprint=excluded.fingerprint,archived=excluded.archived WHERE questions.subject_id=excluded.subject_id RETURNING id`,
    tx
  );
  if (!saved) fail('درس سؤال موجود را نمی‌توان تغییر داد.');
  await audit(tx, actor, 'save', 'question', saved!.id);
}
export const examOperations: Record<string, Operation> = {
  async question(form, user) {
    const subject = id(form, 'subject'),
      key = optional(form, 'id', 36) ? id(form) : null;
    const kind = kindSchema.parse(form.get('kind'));
    const list = (name: string) =>
      optional(form, name, 14000)
        .split(/\r?\n/)
        .map((v) => v.trim())
        .filter(Boolean);
    const answer = list('key');
    const numeric = ['single', 'multi', 'bool', 'number', 'match', 'order'].includes(kind);
    const item = questionInput.parse({
      kind,
      prompt: field(form, 'prompt', 12000),
      chapter: optional(form, 'chapter', 100),
      difficulty: form.get('difficulty'),
      tags: optional(form, 'tags', 250),
      definition: {
        points: digit(form, 'points', 0.01, 1000),
        penalty: digit(form, 'penalty', 0, 1000),
        partial: checked(form, 'partial'),
        options: list('options'),
        right: list('right'),
        key: numeric
          ? answer.map(
              (v) =>
                Number(v.replace(/[۰-۹٠-٩]/g, (c) => String(c.charCodeAt(0) % 16)).replace('٫', '.')) -
                (kind === 'number' ? 0 : 1)
            )
          : answer,
        tolerance: digit(form, 'tolerance', 0, 1000000),
        explanation: optional(form, 'explanation', 6000),
        rubric: optional(form, 'rubric', 6000),
        attachment: optional(form, 'attachment', 36)
          ? id(form, 'attachment')
          : optional(form, 'existingAttachment', 36)
            ? id(form, 'existingAttachment')
            : null,
      },
    });
    await db.transaction((tx) => bankSave(tx, user.id, subject, item, key, checked(form, 'archived')));
  },
  async importQuestions(form, user) {
    const subject = id(form, 'subject');
    const items = z
      .array(questionInput)
      .min(1)
      .max(100)
      .parse(parseJson(field(form, 'payload', 300000)));
    await db.transaction(async (tx) => {
      for (const item of items) await bankSave(tx, user.id, subject, item, null, false);
    });
  },
  async exam(form, user) {
    const key = optional(form, 'id', 36) ? id(form) : null,
      cls = id(form, 'class'),
      scope = (await classScope(cls)) ?? fail('کلاس فعال نیست.'),
      subject = id(form, 'subject'),
      values = config(form);
    const selected = form.getAll('question'),
      targets = z.array(uuid).max(500).parse(form.getAll('target'));
    const count = optional(form, 'random', 5) ? digit(form, 'random', 0, 100, true) : 0;
    const secret = optional(form, 'code', 40);
    const code = secret ? await hashPassword(secret) : null;
    if (values.starts >= values.ends || (optional(form, 'publish', 10) && values.publish >= values.ends))
      fail('بازهٔ آزمون یا زمان انتشار معتبر نیست.');
    const scheduledDay = dayInTehran(values.starts);
    if (scheduledDay < scope.starts || scheduledDay > scope.ends) fail('شروع آزمون خارج از سال تحصیلی است.');
    await db.transaction(async (tx) => {
      const existing = key
        ? await one<Exam>(sql`SELECT * FROM exams WHERE id=${key} FOR UPDATE`, tx)
        : undefined;
      if (key && existing?.state !== 'draft') fail('فقط پیش‌نویس قابل تغییر است.');
      if (existing && !optional(form, 'publish', 10) && existing.publish_at >= values.ends)
        fail('زمان انتشار قبلی پس از پایان تازه است. زمان انتشار را تنظیم کنید.');
      let questionIds = selected.length ? ids.parse(selected) : [];
      if (count) {
        const extra = await rows<{ id: string }>(
          sql`SELECT id FROM questions WHERE subject_id=${subject} AND NOT archived AND NOT(id=ANY(${sql.param(questionIds)}::uuid[])) ORDER BY random() LIMIT ${count}`,
          tx
        );
        if (extra.length !== count) fail('تعداد سؤال‌های قابل انتخاب کافی نیست.');
        questionIds = [...questionIds, ...extra.map((v) => v.id)];
      }
      if (questionIds.length > 100 || new Set(questionIds).size !== questionIds.length)
        fail('فهرست سؤال معتبر نیست.');
      const preserve = key && questionIds.length === 0 && existing?.subject_id === subject;
      const source = preserve
        ? await examQuestions(key, tx)
        : await rows<Question>(
            sql`SELECT q.id,q.kind,q.prompt,q.definition FROM unnest(${sql.param(questionIds)}::uuid[]) WITH ORDINALITY x(id,idx) JOIN questions q ON q.id=x.id WHERE q.subject_id=${subject} AND NOT q.archived ORDER BY x.idx`,
            tx
          );
      if (!source.length || (!preserve && source.length !== questionIds.length))
        fail('سؤال‌های فعال همین درس را انتخاب کنید.');
      const maximum = round(source.reduce((sum, q) => sum + q.definition.points, 0));
      if (values.passing > maximum) fail('حدنصاب نباید از مجموع نمرهٔ سؤال‌ها بیشتر باشد.');
      const eligible = new Set((await roster(cls, scheduledDay, tx)).map((v) => v.student_id));
      if (!targets.every((value) => eligible.has(value))) fail('دانش‌آموز هدف در کلاس انتخابی ثبت نشده است.');
      const item = (await one<{ id: string }>(
        sql`INSERT INTO exams(id,school_id,class_id,subject_id,title,description,instructions,starts,ends,publish_at,minutes,passing,max_attempts,shuffle,shuffle_options,negative,reveal,code_hash)
     VALUES(coalesce(${key}::uuid,gen_random_uuid()),${scope.school_id},${cls},${subject},${values.title},${values.description},${values.instructions},${values.starts},${values.ends},${values.publish},${values.minutes},${values.passing},${values.attempts},${values.shuffle},${values.shuffleOptions},${values.negative},${values.reveal},${code})
     ON CONFLICT(id) DO UPDATE SET school_id=excluded.school_id,class_id=excluded.class_id,subject_id=excluded.subject_id,title=excluded.title,description=excluded.description,instructions=excluded.instructions,starts=excluded.starts,ends=excluded.ends,publish_at=CASE WHEN ${!!optional(form, 'publish', 10)} THEN excluded.publish_at ELSE exams.publish_at END,minutes=excluded.minutes,passing=excluded.passing,max_attempts=excluded.max_attempts,shuffle=excluded.shuffle,shuffle_options=excluded.shuffle_options,negative=excluded.negative,reveal=excluded.reveal,code_hash=CASE WHEN ${checked(form, 'clearCode')} THEN NULL ELSE coalesce(excluded.code_hash,exams.code_hash) END RETURNING id`,
        tx
      ))!;
      if (!preserve) {
        await tx.execute(sql`DELETE FROM exam_questions WHERE exam_id=${item.id}`);
        for (const [index, q] of source.entries())
          await tx.execute(
            sql`INSERT INTO exam_questions(exam_id,position,kind,prompt,definition) VALUES (${item.id},${index},${q.kind},${q.prompt},${json(q.definition)})`
          );
      }
      await tx.execute(sql`DELETE FROM exam_targets WHERE exam_id=${item.id}`);
      for (const target of new Set(targets))
        await tx.execute(sql`INSERT INTO exam_targets(exam_id,student_id) VALUES (${item.id},${target})`);
      await audit(tx, user.id, 'save', 'exam', item.id);
    });
  },
  async examState(form, user) {
    const key = id(form),
      state = z.enum(['draft', 'published', 'archived']).parse(form.get('state'));
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(3162110)`);
      const item =
        (await one<Exam>(sql`SELECT * FROM exams WHERE id=${key} FOR UPDATE`, tx)) ?? fail('آزمون پیدا نشد.');
      if (state === 'published' && (item.state !== 'draft' || item.ends <= new Date()))
        fail('انتشار فقط برای پیش‌نویس با مهلت معتبر ممکن است.');
      if (state === 'published' && !(await classScope(item.class_id))) fail('کلاس آزمون فعال نیست.');
      if (
        state === 'published' &&
        (await one(
          sql`SELECT 1 FROM events WHERE kind<>'holiday' AND starts<${item.ends} AND ends>${item.starts} UNION ALL SELECT 1 FROM exams WHERE id<>${key} AND class_id=${item.class_id} AND state='published' AND starts<${item.ends} AND ends>${item.starts} LIMIT 1`,
          tx
        ))
      )
        fail('بازه با رویداد یا آزمون دیگری در همان کلاس تداخل دارد.');
      if (state === 'draft' && (await one(sql`SELECT 1 FROM attempts WHERE exam_id=${key}`, tx)))
        fail('آزمون دارای پاسخ را نمی‌توان به پیش‌نویس برگرداند.');
      if (
        state === 'archived' &&
        (await one(
          sql`SELECT 1 FROM attempts WHERE exam_id=${key} AND submitted_at IS NULL AND deadline>clock_timestamp()`,
          tx
        ))
      )
        fail('آزمون در حال برگزاری است.');
      await tx.execute(sql`UPDATE exams SET state=${state} WHERE id=${key}`);
      await audit(tx, user.id, state, 'exam', key);
    });
  },
  async duplicate(form, user) {
    const key = id(form);
    await db.transaction(async (tx) => {
      const item =
        (await one<{ id: string }>(
          sql`INSERT INTO exams(school_id,class_id,subject_id,title,description,instructions,starts,ends,publish_at,minutes,passing,max_attempts,shuffle,shuffle_options,negative,reveal)
    SELECT school_id,class_id,subject_id,left(title,160)||' (رونوشت)',description,instructions,starts,ends,publish_at,minutes,passing,max_attempts,shuffle,shuffle_options,negative,reveal FROM exams WHERE id=${key} RETURNING id`,
          tx
        )) ?? fail('آزمون پیدا نشد.');
      await tx.execute(
        sql`INSERT INTO exam_questions(exam_id,position,kind,prompt,definition) SELECT ${item.id},position,kind,prompt,definition FROM exam_questions WHERE exam_id=${key}`
      );
      await tx.execute(
        sql`INSERT INTO exam_targets(exam_id,student_id) SELECT ${item.id},student_id FROM exam_targets WHERE exam_id=${key}`
      );
      await audit(tx, user.id, 'duplicate', 'exam', item.id, { source: key });
    });
  },
  async manualGrade(form, user) {
    const key = id(form),
      question = id(form, 'question'),
      feedback = optional(form, 'feedback', 2000);
    await db.transaction(async (tx) => {
      const attempt =
        (await one<Attempt>(
          sql`SELECT * FROM attempts WHERE id=${key} AND submitted_at IS NOT NULL FOR UPDATE`,
          tx
        )) ?? fail('پاسخ تحویل‌شده پیدا نشد.');
      const item =
        (await one<Question>(
          sql`SELECT id,kind,prompt,definition,position FROM exam_questions WHERE id=${question} AND exam_id=${attempt.exam_id}`,
          tx
        )) ?? fail('سؤال پیدا نشد.');
      const policy = await one<{ negative: boolean }>(
        sql`SELECT negative FROM exams WHERE id=${attempt.exam_id}`,
        tx
      );
      const value = digit(
        form,
        'points',
        policy?.negative && !manual(item.kind) ? -item.definition.penalty : 0,
        item.definition.points
      );
      const old = await one(
        sql`SELECT points,feedback FROM answers WHERE attempt_id=${key} AND question_id=${question}`,
        tx
      );
      await tx.execute(sql`INSERT INTO answers(attempt_id,exam_id,question_id,points,feedback) VALUES (${key},${attempt.exam_id},${question},${value},${feedback})
     ON CONFLICT(attempt_id,question_id) DO UPDATE SET points=excluded.points,feedback=excluded.feedback`);
      await recalculate(tx, attempt);
      await audit(tx, user.id, 'grade', 'attempt', key, {
        question,
        before: old,
        after: { value, feedback },
      });
    });
  },
  async publishResults(form, user) {
    const key = id(form);
    await db.transaction(async (tx) => {
      const exam =
        (await one<Exam>(sql`SELECT * FROM exams WHERE id=${key} FOR UPDATE`, tx)) ?? fail('آزمون پیدا نشد.');
      if (exam.state === 'draft' || exam.ends > new Date())
        fail('انتشار کارنامه پس از پایان آزمون ممکن است.');
      if (!checked(form, 'publish')) {
        await tx.execute(sql`UPDATE exams SET results_at=NULL WHERE id=${key}`);
        await tx.execute(sql`DELETE FROM notifications WHERE topic=${'result:' + key}`);
      } else {
        if (
          await one(
            sql`SELECT 1 FROM attempts WHERE exam_id=${key} AND (submitted_at IS NULL OR NOT finalized)`,
            tx
          )
        )
          fail('ابتدا همهٔ برگه‌ها را نهایی کنید.');
        await tx.execute(sql`UPDATE exams SET results_at=now() WHERE id=${key}`);
        await tx.execute(
          sql`INSERT INTO notifications(user_id,topic,title,path) SELECT DISTINCT student_id,${'result:' + key},${'نتیجه منتشر شد · ' + exam.title},${'/take/' + key} FROM attempts WHERE exam_id=${key} ON CONFLICT DO NOTHING`
        );
      }
      await audit(tx, user.id, checked(form, 'publish') ? 'publish' : 'revoke', 'result', key);
    });
  },
};

export function eligible(student: string | SQL) {
  return sql`EXISTS (SELECT 1 FROM enrollments en JOIN students st ON st.id=en.student_id JOIN classes cl ON cl.id=en.class_id JOIN schools sc ON sc.id=cl.school_id WHERE en.student_id=${student} AND NOT st.archived AND NOT cl.archived AND NOT sc.archived AND en.class_id=e.class_id AND en.starts<=(e.starts AT TIME ZONE 'Asia/Tehran')::date AND (en.ends IS NULL OR en.ends>(e.starts AT TIME ZONE 'Asia/Tehran')::date))
 AND (NOT EXISTS(SELECT 1 FROM exam_targets t WHERE t.exam_id=e.id) OR EXISTS(SELECT 1 FROM exam_targets t WHERE t.exam_id=e.id AND t.student_id=${student}))`;
}
function shuffled<T>(input: T[]) {
  const items = [...input];
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
const sequence = (count: number) => Array.from({ length: count }, (_, i) => i);
export async function startAttempt(key: string, student: string, code: string) {
  const outcome = await db.transaction(async (tx) => {
    const e =
      (await one<Exam>(
        sql`SELECT e.* FROM exams e WHERE e.id=${key} AND e.state='published' AND e.publish_at<=clock_timestamp() AND ${eligible(student)} FOR SHARE OF e`,
        tx
      )) ?? fail('آزمون در دسترس نیست.');
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${'attempt:' + key + ':' + student},0))`
    );
    const now = (await one<{ now: Date }>(sql`SELECT clock_timestamp() AS now`, tx))!.now;
    const attempts = await rows<Attempt>(
      sql`SELECT * FROM attempts WHERE exam_id=${key} AND student_id=${student} ORDER BY ordinal DESC FOR UPDATE`,
      tx
    );
    const last = attempts[0];
    if (last && !last.submitted_at) {
      if (last.deadline > now) return { id: last.id };
      await finalize(tx, last, e, last.deadline);
    }
    if (now < e.starts || now >= e.ends || e.results_at) return { error: 'بازهٔ آزمون فعال نیست.' };
    if (attempts.length >= e.max_attempts) return { error: 'تعداد تلاش‌های مجاز به پایان رسیده است.' };
    if (e.code_hash && !(await verifyPassword(code, e.code_hash))) return { error: 'کد ورود نادرست است.' };
    const qs = await examQuestions(e.id, tx),
      order = e.shuffle ? shuffled(qs) : qs;
    const layout = order.map((q) => {
      const options = sequence(q.kind === 'bool' ? 2 : q.definition.options.length),
        right = sequence(q.definition.right.length);
      return {
        id: q.id,
        options:
          (e.shuffle_options || q.kind === 'order') && q.kind !== 'match' ? shuffled(options) : options,
        right: q.kind === 'match' ? shuffled(right) : right,
      };
    });
    const begun = (await one<{ now: Date }>(sql`SELECT clock_timestamp() AS now`, tx))!.now;
    if (begun >= e.ends) return { error: 'بازهٔ آزمون فعال نیست.' };
    const deadline = new Date(Math.min(begun.getTime() + e.minutes * 60000, e.ends.getTime()));
    const id = (await one<{ id: string }>(
      sql`INSERT INTO attempts(exam_id,student_id,ordinal,started_at,deadline,layout) VALUES(${key},${student},${attempts.length + 1},${begun},${deadline},${json(layout)}) RETURNING id`,
      tx
    ))!.id;
    return { id };
  });
  return outcome.id ?? fail(outcome.error ?? 'آغاز آزمون انجام نشد.');
}
async function recalculate(tx: Executor, attempt: Attempt) {
  await tx.execute(sql`UPDATE attempts SET finalized=NOT EXISTS(SELECT 1 FROM answers WHERE attempt_id=${attempt.id} AND points IS NULL),
 score=(SELECT coalesce(sum(points),0) FROM answers WHERE attempt_id=${attempt.id}) WHERE id=${attempt.id}`);
}
async function finalize(tx: Executor, attempt: Attempt, exam: Exam, submitted: Date) {
  if (attempt.submitted_at) return;
  const values = await rows<{ question_id: string; value: unknown }>(
    sql`SELECT question_id,value FROM answers WHERE attempt_id=${attempt.id}`,
    tx
  );
  const byId = new Map(values.map((v) => [v.question_id, v.value]));
  const calculated = (await examQuestions(exam.id, tx)).map((q) => ({
    question_id: q.id,
    points: grade(q.kind, q.definition, byId.get(q.id), exam.negative),
  }));
  await tx.execute(sql`INSERT INTO answers(attempt_id,exam_id,question_id,points)
   SELECT ${attempt.id},${exam.id},x.question_id,x.points FROM jsonb_to_recordset(${json(calculated)}) AS x(question_id uuid,points numeric)
   ON CONFLICT(attempt_id,question_id) DO UPDATE SET points=excluded.points`);
  await tx.execute(sql`UPDATE attempts SET submitted_at=${submitted} WHERE id=${attempt.id}`);
  await recalculate(tx, attempt);
}
export async function syncAttempt(
  key: string,
  student: string,
  answers: { id: string; value: unknown; flag: boolean; revision: number }[],
  submit: boolean
) {
  return db.transaction(async (tx) => {
    const attempt =
      (await one<Attempt>(
        sql`SELECT * FROM attempts WHERE id=${key} AND student_id=${student} FOR UPDATE`,
        tx
      )) ?? fail('برگه پیدا نشد.');
    if (attempt.submitted_at) return { submitted: true };
    const exam = (await one<Exam>(sql`SELECT * FROM exams WHERE id=${attempt.exam_id}`, tx))!;
    const now = (await one<{ now: Date }>(sql`SELECT clock_timestamp() AS now`, tx))!.now;
    if (now >= attempt.deadline) {
      await finalize(tx, attempt, exam, attempt.deadline);
      return { submitted: true };
    }
    const qs = new Map((await examQuestions(exam.id, tx)).map((q) => [q.id, q]));
    for (const answer of answers) {
      const q = qs.get(answer.id);
      if (!q || !validAnswer(q.kind, q.definition, answer.value)) fail('پاسخ با نوع سؤال سازگار نیست.');
      if (
        q!.kind === 'file' &&
        answer.value &&
        !(await one(sql`SELECT 1 FROM files WHERE id=${answer.value as string} AND owner=${student}`, tx))
      )
        fail('فایل پاسخ معتبر نیست.');
      await tx.execute(sql`INSERT INTO answers(attempt_id,exam_id,question_id,value,flagged,revision) VALUES(${key},${exam.id},${answer.id},${json(answer.value)},${answer.flag},${answer.revision})
     ON CONFLICT(attempt_id,question_id) DO UPDATE SET value=excluded.value,flagged=excluded.flagged,revision=excluded.revision WHERE answers.revision<excluded.revision`);
    }
    if (submit) await finalize(tx, attempt, exam, now);
    return { submitted: submit };
  });
}
export async function sweepExpired(exam?: string) {
  const items = await rows<{ id: string; student_id: string }>(
    sql`SELECT id,student_id FROM attempts WHERE submitted_at IS NULL AND deadline<=clock_timestamp() ${exam ? sql`AND exam_id=${exam}` : sql``} ORDER BY deadline LIMIT 50`
  );
  for (const item of items) await syncAttempt(item.id, item.student_id, [], false);
  return items.length;
}
export function publicQuestions(attempt: Attempt, qs: Question[]) {
  const index = new Map(qs.map((q) => [q.id, q]));
  return attempt.layout.flatMap((layout) => {
    const q = index.get(layout.id);
    if (!q) return [];
    const opts = q.kind === 'bool' ? ['درست', 'نادرست'] : q.definition.options;
    return [
      {
        id: q.id,
        kind: q.kind,
        prompt: q.prompt,
        points: q.definition.points,
        attachment: q.definition.attachment,
        options: layout.options.map((value) => ({ value, label: opts[value] })),
        right: layout.right.map((value) => ({ value, label: q.definition.right[value] })),
      },
    ];
  });
}
