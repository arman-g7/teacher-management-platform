'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { signIn, signOut, loginName, password, requireUser, limit } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/password';
import { db, one, sql, audit } from '@/lib/db';
import { field, optional, id, InputError, fail } from '@/lib/forms';
import { operations } from '@/lib/teacher';
import { examOperations } from '@/lib/exams';

export async function authenticate(_: unknown, form: FormData) {
  const name = loginName.safeParse(form.get('login')),
    secret = z.string().min(1).max(128).safeParse(form.get('password'));
  if (!name.success || !secret.success || !(await signIn(name.data, secret.data)))
    return { error: 'اطلاعات ورود نادرست است یا تعداد تلاش‌ها بیش از حد مجاز است.' };
  redirect('/');
}
export async function logout() {
  await signOut();
  redirect('/login');
}
export async function mutate(_: unknown, form: FormData) {
  try {
    const operation = field(form, 'action', 60);
    const user = await requireUser('teacher');
    if (!(await limit('admin-write:' + user.id, 180, 60))) fail('تعداد درخواست‌ها بیش از حد مجاز است.');
    const handlers = { ...operations, ...examOperations };
    if (!Object.hasOwn(handlers, operation)) return { error: 'عملیات ناشناخته است.' };
    await handlers[operation](form, user);
  } catch (error) {
    if (
      error instanceof InputError ||
      (error instanceof Error && error.message.startsWith('NEXT_REDIRECT'))
    ) {
      if (error instanceof InputError) return { error: error.message };
      throw error;
    }
    if (error instanceof z.ZodError) return { error: 'ساختار داده یا مقدار واردشده معتبر نیست.' };
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (code === '23505') return { error: 'رکوردی با این مشخصات وجود دارد.' };
    if (code === '23503' || code === '23514') return { error: 'رابطه یا محدودهٔ داده معتبر نیست.' };
    console.error('teacher operation failed', code ?? (error as Error).name);
    return { error: 'ذخیره انجام نشد. دوباره تلاش کنید.' };
  }
  return { success: 'ذخیره شد.' };
}
export async function profile(_: unknown, form: FormData) {
  const user = await requireUser(undefined, true);
  if (!(await limit('profile:' + user.id, 15, 900))) return { error: 'تعداد درخواست‌ها بیش از حد مجاز است.' };
  try {
    const name = field(form, 'name', 100);
    const next = z
        .string()
        .max(128)
        .parse(form.get('newPassword') ?? ''),
      original = z
        .string()
        .max(128)
        .parse(form.get('currentPassword') ?? '');
    const photo = optional(form, 'photo', 36) ? id(form, 'photo') : user.photo;
    if (
      photo &&
      photo !== user.photo &&
      !(await one(sql`SELECT 1 FROM files WHERE id=${photo} AND owner=${user.id} AND mime LIKE 'image/%'`))
    )
      fail('تصویر معتبر نیست.');
    if (user.must_change && !next) fail('برای ادامه رمز عبور را تغییر دهید.');
    if (next) {
      const current = await one<{ password: string }>(sql`SELECT password FROM users WHERE id=${user.id}`);
      if (!(await verifyPassword(original, current?.password))) fail('رمز فعلی نادرست است.');
      if (!password.safeParse(next).success || original === next)
        fail('رمز جدید باید متفاوت و دست‌کم ۱۴ نویسه باشد.');
      const nextHash = await hashPassword(next);
      await db.transaction(async (tx) => {
        const changed = await one(
          sql`UPDATE users SET name=${name},photo=${photo},password=${nextHash},must_change=false WHERE id=${user.id} AND password=${current?.password} RETURNING id`,
          tx
        );
        if (!changed) fail('تغییر هم‌زمان رمز. دوباره تلاش کنید.');
        await tx.execute(sql`DELETE FROM sessions WHERE user_id=${user.id}`);
        await audit(tx, user.id, 'password.change', 'user', user.id);
      });
      await signOut();
    } else await db.execute(sql`UPDATE users SET name=${name},photo=${photo} WHERE id=${user.id}`);
    if (next) redirect('/login');
    return { success: 'نمایه ذخیره شد.' };
  } catch (error) {
    if (error instanceof InputError) return { error: error.message };
    if (error instanceof z.ZodError) return { error: 'شناسه معتبر نیست.' };
    throw error;
  }
}
export async function markRead(form: FormData) {
  const user = await requireUser();
  const item = id(form);
  await db.execute(sql`UPDATE notifications SET read_at=now() WHERE id=${item} AND user_id=${user.id}`);
  const { revalidatePath } = await import('next/cache');
  revalidatePath('/notifications');
}
export async function revokeOtherSessions() {
  const user = await requireUser(undefined, true);
  const { cookies } = await import('next/headers');
  const { digest } = await import('@/lib/password');
  const token = (await cookies()).get('teacher_session')?.value;
  if (!token) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM sessions WHERE user_id=${user.id} AND digest<>${digest(token)}`);
    await audit(tx, user.id, 'revoke', 'user', user.id);
  });
  const { revalidatePath } = await import('next/cache');
  revalidatePath('/profile');
}
