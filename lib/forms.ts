import { z } from 'zod';
import { ascii, gregorian, atTehran } from './date';
export class InputError extends Error {}
export const fail = (message: string): never => {
  throw new InputError(message);
};
export const uuid = z.uuid();
export function field(form: FormData, key: string, max = 250, required = true) {
  const value = String(form.get(key) ?? '').trim();
  if (value.length > max || (!value && required)) fail('فیلدهای ضروری و طول مجاز را بررسی کنید.');
  return value;
}
export const optional = (form: FormData, key: string, max = 250) => field(form, key, max, false);
export const id = (form: FormData, key = 'id') => uuid.parse(field(form, key, 36));
export const checked = (form: FormData, key: string) => form.has(key);
export function digit(form: FormData, key: string, min: number, max: number, integer = false) {
  const raw = ascii(field(form, key, 20)).replace('٫', '.');
  const value = Number(raw);
  if (
    !/^-?\d+(?:\.\d+)?$/.test(raw) ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    fail('مقدار عددی خارج از محدوده است.');
  return value;
}
export function date(form: FormData, key: string) {
  try {
    return gregorian(field(form, key, 10));
  } catch {
    return fail('تاریخ شمسی معتبر وارد کنید.');
  }
}
export function timestamp(form: FormData, key: string) {
  try {
    return atTehran(field(form, key, 10), field(form, key + 'Time', 5));
  } catch {
    return fail('تاریخ شمسی و ساعت معتبر وارد کنید.');
  }
}
export function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return fail('ساختار JSON معتبر نیست.');
  }
}
