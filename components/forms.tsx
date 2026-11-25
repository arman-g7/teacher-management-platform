import type { ComponentProps, ReactNode } from 'react';
import { JalaliField } from './controls';
import { dayInTehran, jalaliInput, ZONE } from '@/lib/date';
export type Choice = { id: string; name: string };
export function Input({ label, ...props }: ComponentProps<'input'> & { label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
export function Text({ label, ...props }: ComponentProps<'textarea'> & { label: string }) {
  return (
    <label className="field full">
      <span>{label}</span>
      <textarea rows={3} {...props} />
    </label>
  );
}
export function Check({ label, ...props }: ComponentProps<'input'> & { label: string }) {
  return (
    <label className="check">
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}
export function Select({
  label,
  name,
  choices,
  value,
  blank,
}: {
  label: string;
  name: string;
  choices: Choice[];
  value?: string;
  blank?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select aria-label={label} name={name} defaultValue={value ?? ''} required={blank === undefined}>
        <option value="" disabled={blank === undefined}>
          {blank ?? 'انتخاب کنید'}
        </option>
        {choices.map((item) => (
          <option value={item.id} key={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}
export const choices = (entries: Record<string, string>): Choice[] =>
  Object.entries(entries).map(([id, name]) => ({ id, name }));
export function DateTime({
  name,
  label,
  value,
  required = true,
}: {
  name: string;
  label: string;
  value?: Date;
  required?: boolean;
}) {
  const time = value
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: ZONE,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(value)
    : undefined;
  return (
    <>
      <JalaliField
        name={name}
        label={label}
        value={value ? jalaliInput(dayInTehran(value)) : undefined}
        required={required}
      />
      <Input
        name={name + 'Time'}
        label={'ساعت ' + label}
        type="time"
        defaultValue={time}
        required={required}
        dir="ltr"
      />
    </>
  );
}
export function Hidden({ id }: { id?: string }) {
  return id ? <input name="id" type="hidden" value={id} /> : null;
}
export function Panel({
  title,
  detail,
  children,
  action,
}: {
  title: string;
  detail?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {detail && <p>{detail}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Table({ heads, rows }: { heads: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return <Empty>هنوز داده‌ای برای نمایش وجود ندارد.</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {heads.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
