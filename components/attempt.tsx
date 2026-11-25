'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Bookmark, Clock3, WifiOff } from 'lucide-react';
import type { publicQuestions } from '@/lib/exams';
import { localDigits, ascii } from '@/lib/date';
import { Button } from './ui/button';
import { Attachment, Rich } from './rich';
import { Upload } from './controls';
type SafeQuestion = ReturnType<typeof publicQuestions>[number];
type Entry = { id: string; value: unknown; flag: boolean; revision: number };
async function attemptCall(data: unknown) {
  const response = await fetch('/api/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'ارتباط با سرور برقرار نشد.');
  return body as { id?: string; submitted?: boolean };
}
export function StartExam({
  id,
  code,
  continuing = false,
}: {
  id: string;
  code: boolean;
  continuing?: boolean;
}) {
  const [state, setState] = useState({ pending: false, error: '' }),
    router = useRouter();
  return (
    <form
      method="post"
      className="edit-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const value = String(new FormData(event.currentTarget).get('code') ?? '');
        setState({ pending: true, error: '' });
        try {
          await attemptCall({ action: 'start', id, code: value });
          router.refresh();
        } catch (error) {
          setState({ pending: false, error: (error as Error).message });
        }
      }}
    >
      {code && !continuing && (
        <label className="field">
          <span>کد ورود آزمون</span>
          <input name="code" required type="password" autoComplete="off" maxLength={40} />
        </label>
      )}
      <div className="form-footer">
        <Button type="submit" disabled={state.pending}>
          {state.pending ? 'در حال آماده‌سازی…' : 'شروع آزمون'}
        </Button>
      </div>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
function answered(value: unknown) {
  return Array.isArray(value)
    ? value.some((x) => x !== null)
    : value !== null && value !== undefined && value !== '';
}
function Fields({
  q,
  value,
  onChange,
}: {
  q: SafeQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (q.kind === 'single' || q.kind === 'bool' || q.kind === 'multi') {
    const multi = q.kind === 'multi',
      selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="stack">
        <legend className="sr-only">گزینه‌های پاسخ</legend>
        {q.options.map((o) => (
          <label className="option" key={o.value}>
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={'option-' + q.id}
              checked={multi ? selected.includes(o.value) : o.value === value}
              onChange={(e) =>
                onChange(
                  multi
                    ? e.target.checked
                      ? [...selected, o.value]
                      : selected.filter((v) => v !== o.value)
                    : o.value
                )
              }
            />
            <Rich value={o.label} />
          </label>
        ))}
        {!multi && value !== null && (
          <Button type="button" variant="ghost" onClick={() => onChange(null)}>
            پاک کردن انتخاب
          </Button>
        )}
      </fieldset>
    );
  }
  if (q.kind === 'match' || q.kind === 'order') {
    const match = q.kind === 'match',
      list = match ? q.right : q.options;
    const values = Array.isArray(value) ? value : [];
    return (
      <div className="stack">
        {q.options.map((o, index) => {
          const position = match ? o.value : index;
          return (
            <label key={o.value} className="field">
              <span>{match ? o.label : 'جایگاه ' + localDigits(index + 1)}</span>
              <select
                value={values[position] ?? ''}
                onChange={(e) => {
                  const next = Array.from({ length: q.options.length }, (_, i) => values[i] ?? null);
                  next[position] = e.target.value === '' ? null : Number(e.target.value);
                  onChange(next);
                }}
              >
                <option value="">انتخاب کنید</option>
                {list.map((choice) => (
                  <option
                    key={choice.value}
                    value={choice.value}
                    disabled={values.includes(choice.value) && values[position] !== choice.value}
                  >
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    );
  }
  if (q.kind === 'file')
    return (
      <Upload
        name="answer"
        label="فایل پاسخ"
        previous={typeof value === 'string' ? value : undefined}
        onValue={onChange}
      />
    );
  if (q.kind === 'long' || q.kind === 'image')
    return (
      <label className="field">
        <span>پاسخ تشریحی</span>
        <textarea
          aria-label="پاسخ تشریحی"
          rows={7}
          value={String(value ?? '')}
          maxLength={15000}
          onChange={(e) => onChange(e.target.value || null)}
        />
      </label>
    );
  return (
    <label className="field">
      <span>{q.kind === 'number' ? 'پاسخ عددی' : 'پاسخ'}</span>
      <input
        maxLength={q.kind === 'number' ? 30 : 1000}
        inputMode={q.kind === 'number' ? 'decimal' : 'text'}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </label>
  );
}
export function AttemptPaper({
  id,
  title,
  qs,
  initial,
  deadline,
  serverTime,
}: {
  id: string;
  title: string;
  qs: SafeQuestion[];
  initial: Entry[];
  deadline: number;
  serverTime: number;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(initial.map((row) => [row.id, row]))
  );
  const dirty = useRef(new Map<string, Entry>()),
    sending = useRef(false),
    submitRequested = useRef(false),
    done = useRef(false);
  const clock = useRef({ server: serverTime, wall: 0 });
  const [position, setPosition] = useState(0),
    [remaining, setRemaining] = useState(Math.max(0, Math.ceil((deadline - serverTime) / 1000)));
  const [online, setOnline] = useState(true),
    [confirm, setConfirm] = useState(false),
    [status, setStatus] = useState('پاسخ‌ها به‌صورت خودکار ذخیره می‌شوند.'),
    [busy, setBusy] = useState(false);
  const questionsById = useRef(new Map(qs.map((q) => [q.id, q])));
  async function flush(submit = false, expired = false) {
    if (submit) {
      submitRequested.current = true;
      setBusy(true);
    }
    if (sending.current || done.current || (!navigator.onLine && !expired)) return;
    const submitNow = submitRequested.current;
    const batch = [...dirty.current.values()].filter((e) => {
      if (questionsById.current.get(e.id)?.kind !== 'number' || e.value === null) return true;
      return /^-?\d{1,15}(?:\.\d{1,12})?$/.test(ascii(String(e.value)).replace('٫', '.'));
    });
    if (!expired && dirty.current.size !== batch.length && submitNow) {
      submitRequested.current = false;
      setBusy(false);
      setStatus('پاسخ عددی را اصلاح کنید و دوباره تحویل دهید.');
      return;
    }
    if (!batch.length && !submitNow) return;
    sending.current = true;
    setStatus('در حال ذخیره…');
    try {
      const result = await attemptCall({
        action: 'sync',
        id,
        submit: submitNow,
        answers: expired ? [] : batch,
      });
      if (result.submitted) {
        done.current = true;
        dirty.current.clear();
        router.refresh();
        return;
      }
      for (const item of batch)
        if (dirty.current.get(item.id)?.revision === item.revision) dirty.current.delete(item.id);
      setStatus(dirty.current.size ? 'تغییر ذخیره‌نشده وجود دارد.' : 'پاسخ‌ها ذخیره شدند.');
    } catch (error) {
      setStatus((error as Error).message || 'پاسخ در انتظار ذخیره است.');
      if (!expired) {
        submitRequested.current = false;
        setBusy(false);
      }
    } finally {
      sending.current = false;
    }
  }
  const runner = useRef(flush);
  useEffect(() => {
    runner.current = flush;
  });
  useEffect(() => {
    clock.current = { server: serverTime, wall: performance.now() };
    setOnline(navigator.onLine);
    function tick() {
      const left = Math.max(
        0,
        Math.ceil((deadline - (clock.current.server + performance.now() - clock.current.wall)) / 1000)
      );
      setRemaining(left);
      if (left === 0 && !done.current) void runner.current(true, true);
    }
    function connection() {
      setOnline(navigator.onLine);
      if (navigator.onLine) void runner.current();
    }
    function warn(e: BeforeUnloadEvent) {
      if (dirty.current.size && !done.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    const timer = setInterval(tick, 450),
      autosave = setInterval(() => {
        if (!done.current) void runner.current(false);
      }, 850);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('beforeunload', warn);
    return () => {
      clearInterval(timer);
      clearInterval(autosave);
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('beforeunload', warn);
    };
  }, [deadline, serverTime]);
  const q = qs[position],
    current = answers[q.id];
  function change(value: unknown, flag = current?.flag ?? false) {
    const previous = dirty.current.get(q.id) ?? current;
    const next = { id: q.id, value, flag, revision: (previous?.revision ?? 0) + 1 };
    dirty.current.set(q.id, next);
    setAnswers((prev) => ({ ...prev, [q.id]: next }));
    setStatus('در انتظار ذخیره…');
  }
  const clockText =
    String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
  return (
    <div className="exam-paper attempt">
      <div className="panel exambar">
        <h1>{title}</h1>
        <span className="row timer" aria-label="زمان باقی‌مانده">
          <Clock3 size={18} />
          {localDigits(clockText)}
        </span>
      </div>
      <div className="panel stack">
        <div className="row spread">
          <h2>مرور سؤال‌ها</h2>
          <span className="muted">
            {localDigits(Object.values(answers).filter((x) => answered(x.value)).length)} از{' '}
            {localDigits(qs.length)} پاسخ داده شده
          </span>
        </div>
        <nav className="qnav" aria-label="رفتن به سؤال">
          {qs.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-current={index === position ? 'step' : undefined}
              aria-label={'سؤال ' + localDigits(index + 1) + (answers[item.id]?.flag ? '، نشان‌دار' : '')}
              className={[
                index === position ? 'current' : '',
                answered(answers[item.id]?.value) ? 'answered' : '',
                answers[item.id]?.flag ? 'flagged' : '',
              ].join(' ')}
              onClick={() => setPosition(index)}
            >
              {localDigits(index + 1)}
            </button>
          ))}
        </nav>
        <p role="status">
          {online ? (
            status
          ) : (
            <span className="row">
              <WifiOff size={17} /> اینترنت قطع است. پاسخ‌های ذخیره‌نشده در همین صفحه می‌مانند.
            </span>
          )}
        </p>
      </div>
      <section className="panel stack" aria-label={'سؤال ' + localDigits(position + 1)} key={q.id}>
        <div className="row spread">
          <h2>
            سؤال {localDigits(position + 1)} <span className="badge">{localDigits(q.points)} نمره</span>
          </h2>
          <Button
            type="button"
            variant="outline"
            aria-pressed={current?.flag ?? false}
            disabled={!remaining || busy}
            onClick={() => change(current?.value ?? null, !(current?.flag ?? false))}
          >
            <Bookmark size={16} /> {current?.flag ? 'برداشتن نشان' : 'نشان برای مرور'}
          </Button>
        </div>
        <Rich value={q.prompt} />
        {q.attachment && <Attachment id={q.attachment} image={q.kind === 'image'} />}
        <fieldset className="stack" disabled={!remaining || busy}>
          <legend className="sr-only">پاسخ سؤال</legend>
          <Fields q={q} value={current?.value ?? null} onChange={change} />
        </fieldset>
        <div className="row spread">
          <Button
            type="button"
            variant="outline"
            disabled={!position}
            onClick={() => setPosition(position - 1)}
          >
            <ArrowRight size={16} /> سؤال قبل
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={position === qs.length - 1}
            onClick={() => setPosition(position + 1)}
          >
            سؤال بعد <ArrowLeft size={16} />
          </Button>
        </div>
      </section>
      <div className="panel stack">
        {confirm ? (
          <>
            <p>پس از تحویل این برگه، پاسخ‌ها قابل تغییر نیستند.</p>
            <div className="row">
              <Button type="button" disabled={busy || !online || !remaining} onClick={() => void flush(true)}>
                تأیید و تحویل
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm(false)}>
                بازگشت به سؤال‌ها
              </Button>
            </div>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={busy || !remaining}
            onClick={() => setConfirm(true)}
          >
            تحویل نهایی آزمون
          </Button>
        )}
      </div>
    </div>
  );
}
