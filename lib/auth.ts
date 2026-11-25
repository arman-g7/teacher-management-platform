import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db, one, sql } from './db';
import { digest, verifyPassword } from './password';

export type User = {
  id: string;
  role: 'teacher' | 'student';
  login: string;
  name: string;
  must_change: boolean;
  photo: string | null;
};
export const loginName = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.@+-]{3,100}$/);
export const password = z.string().min(14).max(128);
const cookie = 'teacher_session';
export async function identity() {
  const token = (await cookies()).get(cookie)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  return one<User>(sql`SELECT u.id,u.role,u.login,u.name,u.must_change,u.photo FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.digest=${digest(token)} AND s.expires>now() AND u.active`);
}
export async function requireUser(role?: User['role'], allowChange = false) {
  const user = await identity();
  if (!user) redirect('/login');
  if (user.must_change && !allowChange) redirect('/profile');
  if (role && user.role !== role) redirect('/');
  return user;
}
export async function limit(key: string, max: number, seconds: number) {
  const entry = await one<{
    hits: number;
  }>(sql`INSERT INTO rate_limits(key,hits,until) VALUES (${digest(key)},1,now()+make_interval(secs=>${seconds}))
    ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.until<=now() THEN 1 ELSE rate_limits.hits+1 END,
    until=CASE WHEN rate_limits.until<=now() THEN excluded.until ELSE rate_limits.until END RETURNING hits`);
  return !!entry && entry.hits <= max;
}
export async function signIn(name: string, secret: string) {
  const h = await headers();
  const ip = (h.get('x-vercel-forwarded-for') ?? h.get('x-forwarded-for') ?? 'local')
    .split(',')[0]
    .trim()
    .slice(0, 100);
  const allowed = await limit('login-ip:' + ip, 40, 900);
  if (!allowed || !(await limit('login-account:' + name, 12, 900))) return false;
  const user = await one<{ id: string; active: boolean; password: string }>(
    sql`SELECT id,active,password FROM users WHERE login=${name}`
  );
  if (!(await verifyPassword(secret, user?.password)) || !user?.active) return false;
  const token = randomBytes(32).toString('hex');
  await db.execute(
    sql`INSERT INTO sessions(digest,user_id,expires) VALUES (${digest(token)},${user.id},now()+interval '7 days')`
  );
  (await cookies()).set(cookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && process.env.ALLOW_INSECURE_LOCAL_COOKIE !== '1',
    sameSite: 'lax',
    path: '/',
    maxAge: 604800,
  });
  return true;
}
export async function signOut() {
  const store = await cookies();
  const value = store.get(cookie)?.value;
  if (value) await db.execute(sql`DELETE FROM sessions WHERE digest=${digest(value)}`);
  store.delete(cookie);
}
