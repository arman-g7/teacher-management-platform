import { Pool, types } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql, type SQL } from 'drizzle-orm';

types.setTypeParser(1082, (value) => value);
const globalDb = globalThis as typeof globalThis & { schoolPool?: Pool };
const pool =
  globalDb.schoolPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000,
  });
globalDb.schoolPool = pool;
export const db = drizzle(pool);
export type Executor = Pick<typeof db, 'execute'>;

export async function rows<T = Record<string, unknown>>(query: SQL, executor: Executor = db): Promise<T[]> {
  try {
    const result = await executor.execute(query);
    const timeFields = result.fields.filter((field) => field.dataTypeID === types.builtins.TIMESTAMPTZ);
    for (const row of result.rows)
      for (const { name } of timeFields) {
        const value = row[name];
        if (typeof value === 'string') row[name] = new Date(value);
      }
    return result.rows as T[];
  } catch (error) {
    const code =
      (error as { cause?: { code?: string }; code?: string }).cause?.code ??
      (error as { code?: string }).code;
    throw new Error('PostgreSQL read failed', { cause: { code } });
  }
}
export async function one<T = Record<string, unknown>>(
  query: SQL,
  executor: Executor = db
): Promise<T | undefined> {
  return (await rows<T>(query, executor))[0];
}
export function json(value: unknown) {
  return sql`${JSON.stringify(value)}::jsonb`;
}
export async function audit(
  tx: Executor,
  actor: string,
  action: string,
  entity: string,
  id: string,
  detail: unknown = {}
) {
  await tx.execute(
    sql`INSERT INTO audit(actor,action,entity,entity_id,detail) VALUES (${actor},${action},${entity},${id},${json(detail)})`
  );
}
export { sql };
