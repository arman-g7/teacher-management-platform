import { one, rows, sql } from './db';
import type { Choice } from '@/components/forms';
export type Settings = {
  title?: string;
  header?: string;
  footer?: string;
  grading?: number;
  minutes?: number;
  notifications?: boolean;
  theme?: string;
  logo?: string;
  signature?: string;
  year?: string;
};
export async function settings() {
  return (await one<{ data: Settings }>(sql`SELECT data FROM settings`))?.data ?? {};
}
export async function catalog() {
  const [schools, years, terms, classes, subjects, students] = await Promise.all([
    rows<Choice>(sql`SELECT id,name FROM schools WHERE NOT archived ORDER BY name`),
    rows<Choice>(
      sql`SELECT y.id,s.name||' · '||y.name AS name FROM years y JOIN schools s ON s.id=y.school_id WHERE NOT s.archived ORDER BY y.starts DESC`
    ),
    rows<Choice>(
      sql`SELECT t.id,s.name||' · '||y.name||' · '||t.name AS name FROM terms t JOIN years y ON y.id=t.year_id JOIN schools s ON s.id=y.school_id ORDER BY t.starts DESC`
    ),
    rows<Choice>(
      sql`SELECT c.id,s.name||' · '||c.name||' · '||y.name AS name FROM classes c JOIN schools s ON s.id=c.school_id JOIN years y ON y.id=c.year_id WHERE NOT s.archived AND NOT c.archived ORDER BY y.starts DESC,c.name`
    ),
    rows<Choice>(
      sql`SELECT d.id,s.name||' · '||d.name AS name FROM subjects d JOIN schools s ON s.id=d.school_id WHERE NOT s.archived ORDER BY s.name,d.name`
    ),
    rows<Choice>(
      sql`SELECT s.id,u.name||' · '||s.code AS name FROM students s JOIN users u ON u.id=s.id WHERE NOT s.archived ORDER BY u.name LIMIT 500`
    ),
  ]);
  return { schools, years, terms, classes, subjects, students };
}
export type Catalog = Awaited<ReturnType<typeof catalog>>;
