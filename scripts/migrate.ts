import { readFile, readdir } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { Client } from 'pg';
for (const file of ['.env.local', '.env']) {
  try {
    loadEnvFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const client = new Client({ connectionString: url });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(3162104)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())'
  );
  for (const name of (await readdir('db')).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
    if ((await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount) continue;
    await client.query(await readFile('db/' + name, 'utf8'));
    await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
    console.log(name);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
