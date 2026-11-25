import { z } from 'zod';
import { ascii } from './date';
export const kinds = {
  single: 'تک‌گزینه‌ای',
  multi: 'چندگزینه‌ای',
  bool: 'درست / نادرست',
  short: 'پاسخ کوتاه',
  long: 'تشریحی',
  blank: 'جای خالی',
  number: 'عددی',
  match: 'تطبیقی',
  order: 'ترتیبی',
  file: 'بارگذاری فایل',
  image: 'تصویری',
} as const;
export const kindSchema = z.enum([
  'single',
  'multi',
  'bool',
  'short',
  'long',
  'blank',
  'number',
  'match',
  'order',
  'file',
  'image',
]);
export type Kind = z.infer<typeof kindSchema>;
const text = z.string().trim().min(1).max(500);
export const definitionSchema = z
  .object({
    points: z.number().positive().max(1000),
    penalty: z.number().min(0).max(1000).default(0),
    partial: z.boolean().default(false),
    options: z.array(text).max(30).default([]),
    right: z.array(text).max(30).default([]),
    key: z
      .array(z.union([z.string().min(1).max(500), z.number().finite()]))
      .max(30)
      .default([]),
    tolerance: z.number().min(0).default(0),
    explanation: z.string().max(6000).default(''),
    rubric: z.string().max(6000).default(''),
    attachment: z.uuid().nullable().default(null),
  })
  .refine((def) => def.penalty <= def.points);
export type Definition = z.infer<typeof definitionSchema>;
export const manual = (kind: Kind) => kind === 'long' || kind === 'file' || kind === 'image';
const indexed = (v: unknown, n: number) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n;
const unique = (items: unknown[]) => new Set(items).size === items.length;
export function validDefinition(kind: Kind, d: Definition) {
  const n = d.options.length;
  if (!unique(d.options) || !unique(d.right)) return false;
  switch (kind) {
    case 'single':
      return n >= 2 && d.key.length === 1 && indexed(d.key[0], n);
    case 'multi':
      return n >= 2 && d.key.length > 0 && unique(d.key) && d.key.every((v) => indexed(v, n));
    case 'bool':
      return d.key.length === 1 && indexed(d.key[0], 2);
    case 'short':
    case 'blank':
      return d.key.length > 0 && d.key.every((v) => typeof v === 'string' && v.trim().length > 0);
    case 'number':
      return d.key.length === 1 && typeof d.key[0] === 'number';
    case 'match':
      return (
        n >= 2 &&
        d.right.length === n &&
        d.key.length === n &&
        unique(d.key) &&
        d.key.every((v) => indexed(v, n))
      );
    case 'order':
      return n >= 2 && d.key.length === n && unique(d.key) && d.key.every((v) => indexed(v, n));
    case 'image':
      return !!d.attachment;
    default:
      return true;
  }
}
export function validAnswer(kind: Kind, d: Definition, value: unknown) {
  if (value === null) return true;
  switch (kind) {
    case 'single':
    case 'bool':
      return indexed(value, kind === 'bool' ? 2 : d.options.length);
    case 'multi':
    case 'match':
    case 'order':
      return (
        Array.isArray(value) &&
        value.length <= d.options.length &&
        unique(value.filter((v) => v !== null)) &&
        value.every((v) => (kind !== 'multi' && v === null) || indexed(v, d.options.length))
      );
    case 'file':
      return z.uuid().safeParse(value).success;
    case 'number':
      return typeof value === 'string' && /^-?\d{1,15}(?:\.\d{1,12})?$/.test(ascii(value).replace('٫', '.'));
    default:
      return typeof value === 'string' && value.length <= 15000;
  }
}
const normalize = (v: unknown) =>
  ascii(String(v))
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('fa')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ');
export const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function grade(kind: Kind, d: Definition, value: unknown, negative: boolean): number | null {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && !value.some((v) => v !== null))
  )
    return 0;
  if (manual(kind)) return null;
  let fraction = 0;
  if (kind === 'multi' && Array.isArray(value)) {
    const hits = value.filter((v) => d.key.includes(v)).length;
    fraction =
      hits === d.key.length && hits === value.length
        ? 1
        : d.partial
          ? Math.max(0, (hits - (value.length - hits)) / d.key.length)
          : 0;
  } else if ((kind === 'match' || kind === 'order') && Array.isArray(value)) {
    const hits = d.key.filter((v, i) => v === value[i]).length;
    fraction = hits === d.key.length ? 1 : d.partial ? hits / d.key.length : 0;
  } else if (kind === 'number') {
    const submitted = Number(ascii(String(value)).replace('٫', '.')),
      expected = Number(d.key[0]);
    const slack =
      d.tolerance > 0 ? Number.EPSILON * Math.max(1, Math.abs(submitted), Math.abs(expected)) * 2 : 0;
    fraction = Number(Math.abs(submitted - expected) <= d.tolerance + slack);
  } else if (kind === 'short' || kind === 'blank') {
    fraction = Number(d.key.some((v) => normalize(v) === normalize(value)));
  } else fraction = Number(value === d.key[0]);
  return fraction ? round(fraction * d.points) : negative ? -d.penalty : 0;
}
