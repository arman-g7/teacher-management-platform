import { loadEnvFile } from 'node:process';
import { hashPassword } from '../lib/password';
for (const file of ['.env.local', '.env']) {
  try {
    loadEnvFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
const { ADMIN_LOGIN, ADMIN_PASSWORD, DATABASE_URL } = process.env;
if (
  !DATABASE_URL ||
  !ADMIN_LOGIN?.match(/^[a-zA-Z0-9_.@+-]{3,100}$/) ||
  !ADMIN_PASSWORD ||
  ADMIN_PASSWORD.length < 14 ||
  ADMIN_PASSWORD.length > 128
)
  throw new Error('Set DATABASE_URL, ADMIN_LOGIN and ADMIN_PASSWORD (14–128 characters).');
const { db, one, sql, audit } = await import('../lib/db');
const hash = await hashPassword(ADMIN_PASSWORD);
await db.transaction(async (tx) => {
  const user = await one<{ id: string }>(
    sql`UPDATE users SET password=${hash} WHERE role='teacher' AND login=${ADMIN_LOGIN.toLowerCase()} RETURNING id`,
    tx
  );
  if (!user) throw new Error('Administrator account does not exist.');
  await tx.execute(sql`DELETE FROM sessions WHERE user_id=${user.id}`);
  await audit(tx, user.id, 'password.reset', 'user', user.id);
});
console.log('Administrator password reset and active sessions revoked.');
process.exit(0);
