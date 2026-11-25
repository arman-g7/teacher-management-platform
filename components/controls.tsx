'use client';
import { startTransition, useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight, Paperclip, Printer, SunMoon } from 'lucide-react';
import { dayInTehran, gregorian, jalaliInput, localDigits, parts, ascii } from '@/lib/date';
import { mutate } from '@/app/actions';
import { Button } from './ui/button';

type State = { error?: string; success?: string };
type Action = (state: State, form: FormData) => Promise<State>;
export function Form({
  children,
  operation,
  action = mutate,
  caption = 'ذخیره',
  reset = false,
  inline = false,
}: {
  children: ReactNode;
  operation?: string;
  action?: Action;
  caption?: string;
  reset?: boolean;
  inline?: boolean;
}) {
  const [state, submit, pending] = useActionState(action, {} as State);
  const router = useRouter(),
    ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) {
      if (reset) ref.current?.reset();
      router.refresh();
    }
  }, [state, reset, router]);
  return (
    <form
      method="post"
      ref={ref}
      onSubmit={(event) => {
        event.preventDefault();
        const payload = new FormData(event.currentTarget);
        startTransition(() => submit(payload));
      }}
      className={inline ? 'inline-form' : 'edit-form'}
    >
      {operation && <input type="hidden" name="action" value={operation} />}
      {children}
      <div className="form-footer">
        <Button type="submit" disabled={pending}>
          {pending ? 'در حال ثبت…' : caption}
        </Button>
        {!pending && state.error && (
          <span role="alert" className="feedback error">
            {state.error}
          </span>
        )}
        {!pending && state.success && (
          <span role="status" className="feedback success">
            {state.success}
          </span>
        )}
      </div>
    </form>
  );
}
export function JalaliField({
  name,
  value,
  label = 'تاریخ',
  required = true,
}: {
  name: string;
  value?: string;
  label?: string;
  required?: boolean;
}) {
  const today = jalaliInput(dayInTehran());
  const source = value || today;
  const [val, setVal] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  const [[year, month], setMonth] = useState(source.split('/').map(Number));
  const button = useRef<HTMLButtonElement>(null),
    inputId = useId();
  useEffect(() => setVal(value ?? ''), [value]);
  let start: Date | undefined;
  try {
    start = new Date(gregorian(year + '/' + month + '/1') + 'T12:00:00Z');
  } catch {}
  const offset = start ? (start.getUTCDay() + 1) % 7 : 0;
  const days = start
    ? Array.from({ length: 31 }, (_, i) => parts(new Date(start!.getTime() + i * 86400000))).filter(
        (d) => d[1] === month
      ).length
    : 0;
  function shift(step: number) {
    const index = year * 12 + month - 1 + step;
    setMonth([Math.floor(index / 12), (index % 12) + 1]);
  }
  return (
    <div
      className="field date-field"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <label htmlFor={inputId}>{label}</label>
      <div className="date-input">
        <input
          id={inputId}
          name={name}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="۱۴۰۵/۰۹/۰۱"
          required={required}
          autoComplete="off"
          dir="ltr"
        />
        <button
          ref={button}
          type="button"
          aria-label={'انتخاب ' + label}
          aria-expanded={open}
          onClick={() => {
            const parsed = ascii(val).split('/').map(Number);
            if (
              parsed.length === 3 &&
              parsed[0] >= 1200 &&
              parsed[0] <= 1599 &&
              parsed[1] >= 1 &&
              parsed[1] <= 12
            )
              setMonth(parsed);
            setOpen(!open);
          }}
        >
          <CalendarDays size={18} />
        </button>
      </div>
      {open && (
        <div className="datepicker" role="group" aria-label="تقویم شمسی">
          <div className="calendar-nav">
            <button type="button" aria-label="ماه قبل" onClick={() => shift(-1)}>
              <ChevronRight size={18} />
            </button>
            <strong>
              {new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              }).format(start ?? new Date())}
            </strong>
            <button type="button" aria-label="ماه بعد" onClick={() => shift(1)}>
              <ChevronLeft size={18} />
            </button>
          </div>
          <div className="picker-grid">
            {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((d) => (
              <small key={d}>{d}</small>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={'empty' + i} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = year + '/' + String(month).padStart(2, '0') + '/' + String(i + 1).padStart(2, '0');
              return (
                <button
                  className={ascii(val) === date ? 'chosen' : ''}
                  type="button"
                  key={i}
                  onClick={() => {
                    setVal(localDigits(date));
                    setOpen(false);
                    button.current?.focus();
                  }}
                >
                  {localDigits(i + 1)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
export function Upload({
  name,
  label = 'پیوست',
  accept = '.jpg,.jpeg,.png,.pdf',
  previous,
  onValue,
}: {
  name: string;
  label?: string;
  accept?: string;
  previous?: string;
  onValue?: (id: string) => void;
}) {
  const [entry, setEntry] = useState({ id: previous ?? '', label: '', message: '' });
  const [pending, setPending] = useState(false);
  async function send(file: File) {
    setPending(true);
    setEntry((old) => ({ ...old, message: '' }));
    try {
      const payload = new FormData();
      payload.set('file', file);
      const res = await fetch('/api/files', { method: 'POST', body: payload });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setEntry({ id: result.id, label: result.name, message: '' });
      onValue?.(result.id);
    } catch (error) {
      setEntry((old) => ({ ...old, message: (error as Error).message || 'خطا در بارگذاری' }));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="field upload">
      <span>{label}</span>
      <label className="button outline">
        <Paperclip size={16} />
        {pending ? 'در حال ارسال…' : entry.label || 'انتخاب فایل'}
        <input
          type="file"
          aria-label={label}
          accept={accept}
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void send(file);
          }}
        />
      </label>
      <input type="hidden" name={name} value={entry.id} />
      {entry.id && (
        <a href={'/api/files/' + entry.id} target="_blank" rel="noreferrer">
          مشاهدهٔ فایل
        </a>
      )}
      {entry.message && <p role="alert">{entry.message}</p>}
    </div>
  );
}
export function MarkPresent() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={(event) => {
        const form = event.currentTarget.closest('form');
        form?.querySelectorAll<HTMLSelectElement>('select[data-attendance]').forEach((select) => {
          select.value = 'present';
        });
      }}
    >
      همه حاضر
    </Button>
  );
}
export function ThemeToggle() {
  return (
    <button
      type="button"
      className="icon-button"
      title="تغییر پوسته"
      aria-label="تغییر پوسته"
      onClick={() => {
        const element = document.documentElement;
        const dark =
          element.dataset.theme === 'dark' ||
          (!element.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
        element.dataset.theme = dark ? 'light' : 'dark';
        localStorage.setItem('teacher-theme', element.dataset.theme);
      }}
    >
      <SunMoon size={19} />
    </button>
  );
}
export function Print() {
  return (
    <Button variant="outline" type="button" onClick={() => window.print()}>
      <Printer size={17} /> چاپ / PDF
    </Button>
  );
}
