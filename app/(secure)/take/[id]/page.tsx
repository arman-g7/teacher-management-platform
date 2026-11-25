import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { uuid } from '@/lib/forms';
import { one, rows, sql } from '@/lib/db';
import { eligible, examQuestions, publicQuestions, syncAttempt, type Attempt, type Exam } from '@/lib/exams';
import { jalali, localDigits } from '@/lib/date';
import { StartExam, AttemptPaper } from '@/components/attempt';
import { Heading } from '@/components/admin-records';
import { Panel, Empty } from '@/components/forms';
import { Rich } from '@/components/rich';
import { AnswerText } from '@/components/exam-admin';

export default async function Take({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ attempt?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  if (user.role === 'teacher') redirect('/exams/' + id);
  const exam = await one<Exam>(
    sql`SELECT e.* FROM exams e WHERE e.id=${id} AND ((e.state='published' AND e.publish_at<=now() AND ${eligible(user.id)}) OR EXISTS(SELECT 1 FROM attempts a WHERE a.exam_id=e.id AND a.student_id=${user.id}))`
  );
  if (!exam) notFound();
  let attempts = await rows<Attempt>(
    sql`SELECT * FROM attempts WHERE exam_id=${id} AND student_id=${user.id} ORDER BY ordinal DESC`
  );
  if (attempts[0] && !attempts[0].submitted_at && attempts[0].deadline <= new Date()) {
    await syncAttempt(attempts[0].id, user.id, [], false);
    attempts = await rows<Attempt>(
      sql`SELECT * FROM attempts WHERE exam_id=${id} AND student_id=${user.id} ORDER BY ordinal DESC`
    );
  }
  const latest = attempts[0],
    chosen = (await searchParams).attempt,
    selected = attempts.find((a) => a.id === chosen) ?? latest;
  if (latest && !latest.submitted_at) {
    const [questions, answers, now] = await Promise.all([
      examQuestions(id),
      rows<{ id: string; value: unknown; flag: boolean; revision: number }>(
        sql`SELECT question_id id,value,flagged flag,revision FROM answers WHERE attempt_id=${latest.id}`
      ),
      one<{ now: Date }>(sql`SELECT clock_timestamp() AS now`),
    ]);
    return (
      <AttemptPaper
        key={latest.id}
        id={latest.id}
        title={exam.title}
        qs={publicQuestions(latest, questions)}
        initial={answers}
        deadline={latest.deadline.getTime()}
        serverTime={now!.now.getTime()}
      />
    );
  }
  const current = new Date(),
    canStart =
      exam.state === 'published' &&
      exam.starts <= current &&
      exam.ends > current &&
      attempts.length < exam.max_attempts;
  const gradesVisible = !!(exam.results_at && exam.results_at <= current && selected?.finalized);
  const qs = selected ? await examQuestions(id) : [];
  const answers = selected
    ? new Map(
        (
          await rows<{ question_id: string; value: unknown; points: string | null; feedback: string }>(
            sql`SELECT question_id,value,points,feedback FROM answers WHERE attempt_id=${selected.id}`
          )
        ).map((a) => [a.question_id, a])
      )
    : new Map();
  return (
    <div className="exam-paper">
      <Heading
        title={exam.title}
        description={jalali(exam.starts, true) + ' تا ' + jalali(exam.ends, true)}
        action={
          <Link className="button outline" href="/exams">
            آزمون‌های من
          </Link>
        }
      />
      <Panel
        title="راهنمای آزمون"
        detail={localDigits(exam.minutes) + ' دقیقه · ' + localDigits(exam.max_attempts) + ' تلاش مجاز'}
      >
        <Rich value={exam.description} />
        <Rich value={exam.instructions} />
        {canStart ? (
          <StartExam key={attempts.length} id={id} code={!!exam.code_hash} />
        ) : (
          <p>
            {exam.starts > current
              ? 'آزمون هنوز شروع نشده است.'
              : exam.ends <= current
                ? 'مهلت آزمون به پایان رسیده است.'
                : 'تلاش دیگری برای این آزمون در دسترس نیست.'}
          </p>
        )}
      </Panel>
      {selected ? (
        <>
          <Panel
            title="برگه تحویل شد"
            detail={selected.submitted_at ? jalali(selected.submitted_at, true) : undefined}
          >
            <div className="row">
              {attempts.map((a) => (
                <Link
                  key={a.id}
                  href={'/take/' + id + '?attempt=' + a.id}
                  className={'button ' + (selected.id === a.id ? 'primary' : 'outline')}
                >
                  تلاش {localDigits(a.ordinal)}
                </Link>
              ))}
            </div>
            {gradesVisible ? (
              <p>
                نمرهٔ نهایی <strong>{localDigits(Number(selected.score))}</strong> از{' '}
                {localDigits(Math.round(qs.reduce((s, q) => s + q.definition.points, 0) * 100) / 100)} ·{' '}
                {Number(selected.score) >= Number(exam.passing) ? 'قبول' : 'مردود'}
              </p>
            ) : (
              <p>نتیجه هنوز برای این برگه منتشر نشده است.</p>
            )}
          </Panel>
          <Panel title="پاسخ‌های ثبت‌شده">
            <div className="stack">
              {qs.map((q, i) => {
                const a = answers.get(q.id);
                return (
                  <details key={q.id} className="disclosure">
                    <summary>
                      سؤال {localDigits(i + 1)}{' '}
                      {gradesVisible && ' · نمره ' + localDigits(Number(a?.points ?? 0))}
                    </summary>
                    <div>
                      <Rich value={q.prompt} />
                      <AnswerText question={q} value={a?.value} />
                      {gradesVisible && a?.feedback && <p>بازخورد معلم · {a.feedback}</p>}
                      {gradesVisible && exam.reveal && (
                        <div>
                          <b>پاسخ‌نامه</b>
                          <AnswerText
                            question={q}
                            value={
                              ['single', 'bool', 'number'].includes(q.kind)
                                ? q.definition.key[0]
                                : q.definition.key.length
                                  ? q.definition.key
                                  : null
                            }
                          />
                          <Rich value={q.definition.explanation} />
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </Panel>
        </>
      ) : (
        !canStart && <Empty>در این آزمون هنوز برگه‌ای ثبت نشده است.</Empty>
      )}
    </div>
  );
}
