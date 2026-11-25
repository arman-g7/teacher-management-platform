import Link from 'next/link';
import { notFound } from 'next/navigation';
import { rows, one, sql } from '@/lib/db';
import { settings, type Catalog } from '@/lib/catalog';
import { examQuestions, sweepExpired, type Exam, type Question, type Attempt } from '@/lib/exams';
import { kinds, manual } from '@/lib/scoring';
import { jalali, localDigits } from '@/lib/date';
import { Form, Upload } from './controls';
import { Check, choices, DateTime, Empty, Hidden, Input, Panel, Select, Table, Text } from './forms';
import { Disclosure, Heading, PageNav, pageNumber, valid } from './admin-records';
import { Rich, Attachment } from './rich';
type Bank = Question & {
  subject_id: string;
  chapter: string;
  difficulty: string;
  tags: string;
  archived: boolean;
  subject: string;
};
const differences = { easy: 'آسان', medium: 'متوسط', hard: 'دشوار' };
const num = (v: string | number | null) => (v == null ? '—' : localDigits(Number(v)));
function QuestionForm({ data, item }: { data: Catalog; item?: Bank }) {
  const q = item?.definition;
  const indexType = item && ['single', 'multi', 'bool', 'match', 'order'].includes(item.kind);
  return (
    <Form operation="question" caption={item ? 'ذخیرهٔ سؤال' : 'افزودن سؤال'} reset={!item}>
      <Hidden id={item?.id} />
      <Select name="subject" label="درس" choices={data.subjects} value={item?.subject_id} />
      <Select name="kind" label="نوع سؤال" choices={choices(kinds)} value={item?.kind ?? 'single'} />
      <Input name="chapter" label="فصل" defaultValue={item?.chapter} />
      <Select
        name="difficulty"
        label="سطح دشواری"
        choices={choices(differences)}
        value={item?.difficulty ?? 'medium'}
      />
      <Input name="tags" label="برچسب‌ها" defaultValue={item?.tags} />
      <Input name="points" label="نمرهٔ سؤال" defaultValue={q?.points ?? 1} inputMode="decimal" required />
      <Text name="prompt" label="صورت سؤال (Markdown / LaTeX)" defaultValue={item?.prompt} required />
      <div className="full">
        <p>
          هر گزینه و هر پاسخ را در یک سطر وارد کنید. شماره‌گذاری از ۱ است. برای درست و نادرست، ۱ یعنی درست و ۲
          یعنی نادرست. در تطبیقی، کلید هر سطر شمارهٔ گزینهٔ متناظر در ستون دوم است. در ترتیبی، کلید ترتیب صحیح
          شمارهٔ گزینه‌هاست.
        </p>
      </div>
      <Text name="options" label="گزینه‌ها یا ستون اول" defaultValue={q?.options.join('\n')} />
      <Text name="right" label="ستون دوم سؤال تطبیقی" defaultValue={q?.right.join('\n')} />
      <Text
        name="key"
        label="پاسخ‌نامه"
        defaultValue={q?.key.map((v) => (indexType ? Number(v) + 1 : v)).join('\n')}
      />
      <Input
        name="penalty"
        label="جریمهٔ پاسخ نادرست"
        inputMode="decimal"
        defaultValue={q?.penalty ?? 0}
        required
      />
      <Input
        name="tolerance"
        label="تلورانس سؤال عددی"
        inputMode="decimal"
        defaultValue={q?.tolerance ?? 0}
        required
      />
      <Text name="explanation" label="توضیح پاسخ" defaultValue={q?.explanation} />
      <Text name="rubric" label="راهنمای تصحیح" defaultValue={q?.rubric} />
      <Upload name="attachment" label="تصویر یا پیوست" previous={q?.attachment ?? undefined} />
      {q?.attachment && <input name="existingAttachment" type="hidden" value={q.attachment} />}
      <Check
        name="partial"
        label="نمرهٔ جزئی برای چندگزینه‌ای، تطبیقی و ترتیبی"
        defaultChecked={q?.partial}
      />
      {item && <Check name="archived" label="بایگانی سؤال" defaultChecked={item.archived} />}
    </Form>
  );
}
export async function QuestionBank({
  data,
  query,
  detail,
}: {
  data: Catalog;
  query: Record<string, string | undefined>;
  detail?: string;
}) {
  if (detail) {
    const item = valid(detail)
      ? await one<Bank>(
          sql`SELECT q.*,d.name subject FROM questions q JOIN subjects d ON d.id=q.subject_id WHERE q.id=${detail}`
        )
      : undefined;
    if (!item) notFound();
    return (
      <>
        <Heading
          title="ویرایش سؤال"
          description={item.subject + ' · ' + kinds[item.kind]}
          action={
            <Link className="button outline" href="/questions">
              بانک سؤال
            </Link>
          }
        />
        <Panel title="پیش‌نمایش">
          <Rich value={item.prompt} />
          {item.definition.attachment && (
            <Attachment id={item.definition.attachment} image={item.kind === 'image'} />
          )}
        </Panel>
        <Panel title="مشخصات سؤال">
          <QuestionForm data={data} item={item} />
        </Panel>
      </>
    );
  }
  const page = pageNumber(query.page),
    term = (query.q ?? '').slice(0, 100);
  const list =
    await rows<Bank>(sql`SELECT q.id,q.kind,q.prompt,q.chapter,q.difficulty,q.archived,d.name subject FROM questions q JOIN subjects d ON d.id=q.subject_id
 WHERE q.archived=${query.archived === '1'} ${valid(query.subject) ? sql`AND q.subject_id=${query.subject}` : sql``}
 ${Object.hasOwn(differences, query.diff ?? '') ? sql`AND q.difficulty=${query.diff}` : sql``}
 ${term ? sql`AND position(lower(${term}) in lower(q.prompt||' '||q.chapter||' '||q.tags))>0` : sql``} ORDER BY d.name,q.chapter,q.id LIMIT 31 OFFSET ${(page - 1) * 30}`);
  return (
    <>
      <Heading
        title="بانک سؤال"
        description="سؤال‌ها را به تفکیک درس و فصل بسازید و در آزمون‌های بعدی استفاده کنید."
      />
      <Panel title="افزودن سؤال">
        <Disclosure title="سؤال تازه">
          <QuestionForm data={data} />
        </Disclosure>
        <Disclosure title="ورود گروهی JSON">
          <Form operation="importQuestions" caption="ورود سؤال‌ها" reset>
            <Select name="subject" label="درس" choices={data.subjects} />
            <Text name="payload" label="آرایهٔ JSON سؤال‌ها" dir="ltr" required />
            <p className="full">
              ساختار و مثال هر نوع سؤال در راهنمای کاربر آمده است. شماره‌های داخل کلید JSON از صفر شروع
              می‌شوند.
            </p>
          </Form>
        </Disclosure>
      </Panel>
      <Panel title="جست‌وجوی سؤال">
        <form className="filter">
          <Input name="q" label="صورت سؤال، فصل یا برچسب" defaultValue={term} />
          <Select name="subject" label="درس" choices={data.subjects} value={query.subject} blank="همه" />
          <Select name="diff" label="دشواری" choices={choices(differences)} value={query.diff} blank="همه" />
          <Select
            label="وضعیت"
            name="archived"
            choices={choices({ '0': 'فعال', '1': 'بایگانی' })}
            value={query.archived ?? '0'}
          />
          <button className="button primary">جست‌وجو</button>
        </form>
        <Table
          heads={['سؤال', 'درس', 'فصل', 'نوع', 'دشواری']}
          rows={list.slice(0, 30).map((q) => [
            <Link className="text-link" href={'/questions/' + q.id}>
              {q.prompt.slice(0, 100)}
            </Link>,
            q.subject,
            q.chapter || '—',
            kinds[q.kind],
            differences[q.difficulty as keyof typeof differences],
          ])}
        />
        <PageNav path="/questions" query={query} page={page} more={list.length > 30} />
      </Panel>
    </>
  );
}
export function stateLabel(exam: Exam) {
  if (exam.state === 'draft') return 'پیش‌نویس';
  if (exam.state === 'archived') return 'بایگانی';
  const now = new Date();
  if (exam.ends <= now) return 'پایان‌یافته';
  return exam.starts > now || exam.publish_at > now ? 'زمان‌بندی شده' : 'فعال';
}
type ExamRow = Exam & { subject: string; class_name: string; school: string; pending: number };
async function ExamForm({ data, item }: { data: Catalog; item?: ExamRow }) {
  const [possible, targets, config] = await Promise.all([
    rows<{ id: string; prompt: string; subject_id: string; subject: string; points: string }>(
      sql`SELECT q.id,q.prompt,q.subject_id,d.name subject,q.definition->>'points' points FROM questions q JOIN subjects d ON d.id=q.subject_id WHERE NOT q.archived ORDER BY d.name,q.chapter,q.id LIMIT 500`
    ),
    item
      ? rows<{ student_id: string }>(sql`SELECT student_id FROM exam_targets WHERE exam_id=${item.id}`)
      : [],
    settings(),
  ]);
  const [targetSet, selected] = [new Set(targets.map((t) => t.student_id)), item?.subject_id];
  return (
    <Form operation="exam" caption={item ? 'ذخیرهٔ پیش‌نویس' : 'ساخت پیش‌نویس'} reset={!item}>
      <Hidden id={item?.id} />
      <Input name="title" label="عنوان آزمون" defaultValue={item?.title} required />
      <Select name="class" label="کلاس" choices={data.classes} value={item?.class_id} />
      <Select name="subject" label="درس" choices={data.subjects} value={selected} />
      <Input
        name="minutes"
        label="مدت آزمون (دقیقه)"
        type="number"
        min={1}
        max={480}
        defaultValue={item?.minutes ?? config.minutes ?? 45}
        required
      />
      <Text name="description" label="توضیحات" defaultValue={item?.description} />
      <Text name="instructions" label="دستورالعمل آزمون" defaultValue={item?.instructions} />
      <DateTime name="start" label="آغاز آزمون" value={item?.starts} />
      <DateTime name="end" label="پایان آزمون" value={item?.ends} />
      <DateTime name="publish" label="انتشار زمان‌بندی‌شده (اختیاری)" value={undefined} required={false} />
      {item && (
        <p className="full">
          زمان انتشار قبلی {jalali(item.publish_at, true)}. برای تنظیم مجدد تاریخ و ساعت را وارد کنید.
        </p>
      )}
      <Input
        name="passing"
        label="نمرهٔ قبولی"
        defaultValue={item?.passing ?? 0}
        inputMode="decimal"
        required
      />
      <Input
        name="attempts"
        label="حداکثر تلاش"
        type="number"
        min={1}
        max={10}
        defaultValue={item?.max_attempts ?? 1}
        required
      />
      <Input name="code" label="کد اختیاری ورود" autoComplete="off" type="password" maxLength={40} />
      <Input
        name="random"
        label="تعداد سؤال تصادفی از همین درس"
        defaultValue={0}
        type="number"
        min={0}
        max={100}
      />
      {item?.code_hash && <Check name="clearCode" label="حذف کد قبلی" />}
      <Check name="shuffle" label="ترتیب تصادفی سؤال‌ها" defaultChecked={item?.shuffle} />
      <Check name="shuffleOptions" label="ترتیب تصادفی گزینه‌ها" defaultChecked={item?.shuffle_options} />
      <Check name="negative" label="نمرهٔ منفی برای پاسخ نادرست" defaultChecked={item?.negative} />
      <Check name="reveal" label="نمایش پاسخ‌نامه همراه نتایج منتشرشده" defaultChecked={item?.reveal} />
      <div className="full">
        <details className="disclosure">
          <summary>گزینش سؤال از بانک</summary>
          <div>
            <p>
              {item
                ? 'برای حفظ نسخهٔ فعلی سؤال‌ها، این بخش را خالی بگذارید. انتخاب جدید همهٔ سؤال‌ها را جایگزین می‌کند.'
                : 'سؤال‌های درس را انتخاب کنید یا تعداد سؤال تصادفی را مشخص کنید.'}
            </p>
            <div className="choice-scroll" aria-label="سؤال‌های بانک">
              {possible.map((q) => (
                <Check
                  key={q.id}
                  label={q.subject + ' · ' + q.prompt.slice(0, 115) + ' · ' + num(q.points) + ' نمره'}
                  name="question"
                  value={q.id}
                />
              ))}
            </div>
          </div>
        </details>
      </div>
      <div className="full">
        <details className="disclosure">
          <summary>دانش‌آموزان هدف (اختیاری)</summary>
          <div>
            <p>با فهرست خالی، همهٔ دانش‌آموزان واجد شرایط کلاس دسترسی دارند.</p>
            <div className="choice-scroll">
              {data.students.map((s) => (
                <Check
                  key={s.id}
                  label={s.name}
                  name="target"
                  value={s.id}
                  defaultChecked={targetSet.has(s.id)}
                />
              ))}
            </div>
          </div>
        </details>
      </div>
    </Form>
  );
}
type GradingAnswer = { question_id: string; value: unknown; points: string | null; feedback: string };
type AttemptRow = Attempt & { name: string };
function AnswerText({ question, value }: { question: Question; value: unknown }) {
  if (value == null) return <span className="muted">بدون پاسخ</span>;
  if (question.kind === 'file' && typeof value === 'string') return <Attachment id={value} />;
  if (question.kind === 'bool') return value === 0 ? 'درست' : 'نادرست';
  if (question.kind === 'single') return question.definition.options[Number(value)] ?? '—';
  if (Array.isArray(value) && ['short', 'blank', 'long', 'image'].includes(question.kind))
    return value.join('، ');
  if (Array.isArray(value))
    return value
      .map((x, i) =>
        question.kind === 'match'
          ? question.definition.options[i] + ' ← ' + (x == null ? '—' : (question.definition.right[x] ?? '—'))
          : x == null
            ? '—'
            : (question.definition.options[x] ?? '—')
      )
      .join('، ');
  return <div className="response-text">{String(value)}</div>;
}
export { AnswerText };
async function Grading({ exam, attempt, qs }: { exam: Exam; attempt: AttemptRow; qs: Question[] }) {
  const [entries, history] = await Promise.all([
    rows<GradingAnswer>(
      sql`SELECT question_id,value,points,feedback FROM answers WHERE attempt_id=${attempt.id}`
    ),
    rows<{ at: Date; detail: unknown }>(
      sql`SELECT at,detail FROM audit WHERE entity='attempt' AND entity_id=${attempt.id} ORDER BY at DESC LIMIT 25`
    ),
  ]);
  const by = new Map(entries.map((a) => [a.question_id, a]));
  return (
    <>
      <Heading
        title={attempt.name}
        description={
          exam.title +
          ' · تلاش ' +
          num(attempt.ordinal) +
          ' · نمره ' +
          (attempt.finalized ? num(attempt.score) : 'در انتظار تصحیح')
        }
        action={
          <Link className="button outline" href={'/exams/' + exam.id}>
            بازگشت به آزمون
          </Link>
        }
      />
      {attempt.submitted_at ? (
        qs.map((q, i) => {
          const a = by.get(q.id);
          return (
            <Panel
              key={q.id}
              title={'سؤال ' + num(i + 1) + ' · ' + kinds[q.kind]}
              detail={'سقف ' + num(q.definition.points) + ' · نمرهٔ ثبت‌شده ' + num(a?.points ?? null)}
            >
              <div className="stack">
                <Rich value={q.prompt} />
                {q.definition.attachment && (
                  <Attachment id={q.definition.attachment} image={q.kind === 'image'} />
                )}
                <div>
                  <b>پاسخ دانش‌آموز</b>
                  <AnswerText question={q} value={a?.value} />
                </div>
                {q.definition.rubric && (
                  <div>
                    <b>راهنمای تصحیح</b>
                    <Rich value={q.definition.rubric} />
                  </div>
                )}
                {manual(q.kind) && a?.points == null && (
                  <span className="badge warning">نیاز به تصحیح دستی</span>
                )}
                <Form operation="manualGrade" caption="ثبت نمره و بازخورد">
                  <Hidden id={attempt.id} />
                  <input name="question" type="hidden" value={q.id} />
                  <Input
                    name="points"
                    label="نمره"
                    inputMode="decimal"
                    defaultValue={a?.points ?? undefined}
                    required
                  />
                  <Text name="feedback" label="بازخورد برای دانش‌آموز" defaultValue={a?.feedback} />
                </Form>
              </div>
            </Panel>
          );
        })
      ) : (
        <Panel title="وضعیت پاسخ">
          <Empty>دانش‌آموز هنوز برگه را تحویل نداده است.</Empty>
        </Panel>
      )}
      <Panel title="تاریخچهٔ تصحیح">
        <Table
          heads={['زمان', 'تغییر']}
          rows={history.map((v) => [
            jalali(v.at, true),
            <details>
              <summary>مشاهده</summary>
              <pre dir="ltr">{JSON.stringify(v.detail, null, 2)}</pre>
            </details>,
          ])}
        />
      </Panel>
    </>
  );
}
export async function ExamsAdmin({
  data,
  detail,
  attemptId,
  query,
}: {
  data: Catalog;
  detail?: string;
  attemptId?: string;
  query: Record<string, string | undefined>;
}) {
  if (detail) {
    const item = valid(detail)
      ? await one<ExamRow>(
          sql`SELECT e.*,d.name subject,c.name class_name,s.name school FROM exams e JOIN subjects d ON d.id=e.subject_id JOIN schools s ON s.id=e.school_id JOIN classes c ON c.id=e.class_id WHERE e.id=${detail}`
        )
      : undefined;
    if (!item) notFound();
    await sweepExpired(item.id);
    const qs = await examQuestions(item.id);
    if (attemptId) {
      const attempt = valid(attemptId)
        ? await one<AttemptRow>(
            sql`SELECT a.*,u.name FROM attempts a JOIN users u ON u.id=a.student_id WHERE a.id=${attemptId} AND a.exam_id=${item.id}`
          )
        : undefined;
      if (!attempt) notFound();
      return <Grading exam={item} attempt={attempt} qs={qs} />;
    }
    const page = pageNumber(query.page);
    const [attempts, analysis] = await Promise.all([
      rows<AttemptRow>(
        sql`SELECT a.*,u.name FROM attempts a JOIN users u ON u.id=a.student_id WHERE a.exam_id=${item.id} ORDER BY a.started_at DESC,a.id LIMIT 31 OFFSET ${(page - 1) * 30}`
      ),
      rows<{ id: string; count: number; mean: number | null }>(
        sql`SELECT q.id,count(a.points)::int count,round(avg(a.points),2)::float8 mean FROM exam_questions q LEFT JOIN answers a ON a.question_id=q.id WHERE q.exam_id=${item.id} GROUP BY q.id ORDER BY q.position`
      ),
    ]);
    const maximum = qs.reduce((sum, q) => sum + q.definition.points, 0);
    return (
      <>
        <Heading
          title={item.title}
          description={item.school + ' · ' + item.class_name + ' · ' + item.subject}
          action={
            <div className="row">
              <span className="badge">{stateLabel(item)}</span>
              <Link className="button outline" href="/exams">
                فهرست آزمون‌ها
              </Link>
            </div>
          }
        />
        <div className="two-col">
          <Panel title="وضعیت آزمون" detail={jalali(item.starts, true) + ' تا ' + jalali(item.ends, true)}>
            <div className="stack">
              <p>
                {num(qs.length)} سؤال · سقف {num(Math.round(maximum * 100) / 100)} · حدنصاب{' '}
                {num(item.passing)}
              </p>
              <div className="row">
                {item.state === 'draft' && (
                  <Form operation="examState" caption="انتشار آزمون" inline>
                    <Hidden id={item.id} />
                    <input name="state" type="hidden" value="published" />
                  </Form>
                )}
                {item.state !== 'draft' && (
                  <Form operation="examState" caption="بازگشت به پیش‌نویس" inline>
                    <Hidden id={item.id} />
                    <input name="state" type="hidden" value="draft" />
                  </Form>
                )}
                {item.state !== 'archived' && (
                  <Form operation="examState" caption="بایگانی" inline>
                    <Hidden id={item.id} />
                    <input name="state" type="hidden" value="archived" />
                  </Form>
                )}
                <Form operation="duplicate" caption="ساخت رونوشت" inline>
                  <Hidden id={item.id} />
                </Form>
              </div>
              {item.state !== 'draft' && (
                <Link className="text-link" href={'/take/' + item.id}>
                  پیوند اختصاصی آزمون · /take/{item.id}
                </Link>
              )}
            </div>
          </Panel>
          <Panel
            title="انتشار نتایج"
            detail={
              item.results_at ? 'منتشر شده در ' + jalali(item.results_at, true) : 'نتیجه‌ها خصوصی هستند.'
            }
          >
            <Form operation="publishResults" caption="ذخیرهٔ وضعیت انتشار">
              <Hidden id={item.id} />
              <Check
                name="publish"
                label="نتیجهٔ تصحیح‌شده برای دانش‌آموزان قابل مشاهده باشد"
                defaultChecked={!!item.results_at}
              />
            </Form>
          </Panel>
        </div>
        {item.state === 'draft' && (
          <Panel title="ویرایش پیش‌نویس">
            <Disclosure title="تنظیمات و سؤال‌های آزمون">
              <ExamForm data={data} item={item} />
            </Disclosure>
          </Panel>
        )}
        <Panel title="پیش‌نمایش آزمون" detail={item.instructions}>
          <div className="stack">
            {qs.map((q, i) => (
              <Disclosure
                key={q.id}
                title={num(i + 1) + ' · ' + kinds[q.kind] + ' · ' + num(q.definition.points) + ' نمره'}
              >
                <Rich value={q.prompt} />
                {q.definition.attachment && (
                  <Attachment id={q.definition.attachment} image={q.kind === 'image'} />
                )}
                <p>{q.definition.options.join(' · ')}</p>
              </Disclosure>
            ))}
          </div>
        </Panel>
        <Panel title="پاسخ‌های دانش‌آموزان">
          <Table
            heads={['دانش‌آموز', 'تلاش', 'تحویل', 'وضعیت', 'نمره']}
            rows={attempts.slice(0, 30).map((a) => [
              <Link className="text-link" href={'/exams/' + item.id + '/' + a.id}>
                {a.name}
              </Link>,
              num(a.ordinal),
              a.submitted_at ? jalali(a.submitted_at, true) : '—',
              a.finalized ? 'تصحیح شده' : a.submitted_at ? 'در انتظار تصحیح' : 'در حال پاسخ',
              a.finalized ? num(a.score) : '—',
            ])}
          />
          <PageNav path={'/exams/' + item.id} query={query} page={page} more={attempts.length > 30} />
        </Panel>
        <Panel title="تحلیل سؤال‌ها">
          <Table
            heads={['سؤال', 'تصحیح‌شده', 'میانگین', 'سقف']}
            rows={analysis.map((a, i) => [
              num(i + 1),
              num(a.count),
              num(a.mean),
              num(qs[i].definition.points),
            ])}
          />
        </Panel>
      </>
    );
  }
  const page = pageNumber(query.page);
  const list =
    await rows<ExamRow>(sql`SELECT e.*,d.name subject,c.name class_name,s.name school,(SELECT count(*)::int FROM attempts a WHERE a.exam_id=e.id AND a.submitted_at IS NOT NULL AND NOT a.finalized) pending
 FROM exams e JOIN subjects d ON d.id=e.subject_id JOIN schools s ON s.id=e.school_id JOIN classes c ON c.id=e.class_id ORDER BY e.starts DESC,e.id LIMIT 31 OFFSET ${(page - 1) * 30}`);
  return (
    <>
      <Heading
        title="آزمون‌ها"
        description="آزمون بسازید، پاسخ‌ها را تصحیح کنید و نتیجه‌ها را منتشر کنید."
        action={
          <Link className="button outline" href="/questions">
            رفتن به بانک سؤال
          </Link>
        }
      />
      <Panel title="آزمون جدید">
        <Disclosure title="ساخت آزمون">
          <ExamForm data={data} />
        </Disclosure>
      </Panel>
      <Panel title="فهرست آزمون‌ها">
        <Table
          heads={['عنوان', 'مدرسه و کلاس', 'درس', 'شروع', 'وضعیت', 'تصحیح دستی']}
          rows={list.slice(0, 30).map((e) => [
            <Link className="text-link" href={'/exams/' + e.id}>
              {e.title}
            </Link>,
            e.school + ' · ' + e.class_name,
            e.subject,
            jalali(e.starts, true),
            <span className="badge">{stateLabel(e)}</span>,
            num(e.pending),
          ])}
        />
        <PageNav path="/exams" query={query} page={page} more={list.length > 30} />
      </Panel>
    </>
  );
}
