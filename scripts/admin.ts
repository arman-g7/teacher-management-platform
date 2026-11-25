import { loadEnvFile } from 'node:process';
import { hashPassword } from '../lib/password';
for (const file of ['.env.local', '.env']) {
  try {
    loadEnvFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
const { db, sql } = await import('../lib/db');
const { ADMIN_LOGIN, ADMIN_NAME, ADMIN_PASSWORD, DATABASE_URL } = process.env;
if (
  !DATABASE_URL ||
  !ADMIN_NAME ||
  !ADMIN_LOGIN?.match(/^[a-zA-Z0-9_.@+-]{3,100}$/) ||
  !ADMIN_PASSWORD ||
  ADMIN_PASSWORD.length < 14 ||
  ADMIN_PASSWORD.length > 128
)
  throw new Error('Set DATABASE_URL, ADMIN_LOGIN, ADMIN_NAME and ADMIN_PASSWORD (14–128 characters).');
const result = await db.execute(
  sql`INSERT INTO users(role,login,name,password) VALUES ('teacher',${ADMIN_LOGIN.toLowerCase()},${ADMIN_NAME},${await hashPassword(ADMIN_PASSWORD)}) ON CONFLICT DO NOTHING RETURNING id`
);
if (!result.rowCount) throw new Error('Administrator already exists or username is in use.');
console.log('Administrator created.');
process.exit(0);
