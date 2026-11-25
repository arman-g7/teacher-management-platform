export const ZONE = 'Asia/Tehran';
export const localDigits = (value: string | number) =>
  String(value).replace(/\d/g, (n) => '۰۱۲۳۴۵۶۷۸۹'[Number(n)]);
export const ascii = (value: string) => value.replace(/[۰-۹٠-٩]/g, (c) => String(c.charCodeAt(0) % 16));
const calendar = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  timeZone: 'UTC',
});
export function parts(date: Date) {
  const values = calendar.formatToParts(date);
  return ['year', 'month', 'day'].map((key) => Number(values.find((part) => part.type === key)?.value));
}
export function gregorian(value: string) {
  const match = /^(1[2345]\d\d)\/(\d{1,2})\/(\d{1,2})$/.exec(ascii(value));
  if (!match) throw new Error('تاریخ شمسی معتبر وارد کنید.');
  const [year, month, day] = match.slice(1).map(Number);
  const target = year * 10000 + month * 100 + day;
  let min = Date.UTC(year + 621, 2, 18) / 86400000,
    max = min + 373;
  while (min <= max) {
    const mid = Math.floor((min + max) / 2),
      date = new Date(mid * 86400000);
    const [y, m, d] = parts(date);
    const candidate = y * 10000 + m * 100 + d;
    if (candidate === target) return date.toISOString().slice(0, 10);
    if (candidate < target) min = mid + 1;
    else max = mid - 1;
  }
  throw new Error('تاریخ شمسی معتبر وارد کنید.');
}
export function dayInTehran(date = new Date()) {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return ['year', 'month', 'day'].map((key) => values.find((part) => part.type === key)?.value).join('-');
}
export function atTehran(date: string, time: string) {
  const local = ascii(time);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(local)) throw new Error('ساعت معتبر وارد کنید.');
  const day = gregorian(date),
    base = Date.parse(day + 'T' + local + ':00Z');
  const offsetFormat = new Intl.DateTimeFormat('en', { timeZone: ZONE, timeZoneName: 'longOffset' });
  const wallFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const candidates: Date[] = [];
  for (const delta of [-86400000, 0, 86400000]) {
    const offset = offsetFormat
      .formatToParts(new Date(base + delta))
      .find((p) => p.type === 'timeZoneName')
      ?.value.match(/GMT([+-])(\d\d):(\d\d)/);
    if (!offset) continue;
    const candidate = new Date(
      base - (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3])) * 60000
    );
    if (dayInTehran(candidate) === day && wallFormat.format(candidate) === local) candidates.push(candidate);
  }
  if (!candidates.length) throw new Error('این ساعت محلی در تقویم تهران معتبر نیست.');
  return new Date(Math.min(...candidates.map((v) => v.getTime())));
}
export function jalali(value: string | Date, clock = false) {
  const date =
    typeof value === 'string' && value.length === 10 ? new Date(value + 'T12:00:00Z') : new Date(value);
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone: ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(clock ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}
export function jalaliInput(iso: string) {
  return parts(new Date(iso.slice(0, 10) + 'T12:00:00Z'))
    .map((v, i) => String(v).padStart(i ? 2 : 4, '0'))
    .join('/');
}
