import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
const connectionString = process.env.TEST_DATABASE_URL;
test(
  'PostgreSQL rejects cross-school class references and duplicate session/attendance keys',
  { skip: !connectionString },
  async () => {
    const db = new pg.Client({ connectionString });
    await db.connect();
    async function create(query: string, params: unknown[] = []) {
      return (await db.query(query, params)).rows[0].id as string;
    }
    async function rejects(query: string, params: unknown[], code: string) {
      await db.query('SAVEPOINT validation');
      await assert.rejects(
        db.query(query, params),
        (error: unknown) => (error as { code: string }).code === code
      );
      await db.query('ROLLBACK TO SAVEPOINT validation');
    }
    try {
      await db.query('BEGIN');
      const school = await create("INSERT INTO schools(name) VALUES ('QA-1') RETURNING id");
      const other = await create("INSERT INTO schools(name) VALUES ('QA-2') RETURNING id");
      const year = await create(
        "INSERT INTO years(school_id,name,starts,ends) VALUES($1,'QA','2025-01-01','2025-12-31') RETURNING id",
        [school]
      );
      await rejects(
        "INSERT INTO classes(school_id,year_id,name,level) VALUES($1,$2,'invalid','1')",
        [other, year],
        '23503'
      );
      const cls = await create(
        "INSERT INTO classes(school_id,year_id,name,level) VALUES($1,$2,'class','1') RETURNING id",
        [school, year]
      );
      const subject = await create("INSERT INTO subjects(school_id,name) VALUES($1,'science') RETURNING id", [
        school,
      ]);
      const foreign = await create("INSERT INTO subjects(school_id,name) VALUES($1,'science') RETURNING id", [
        other,
      ]);
      const insert =
        "INSERT INTO attendance_sessions(school_id,class_id,subject_id,day,slot) VALUES($1,$2,$3,'2025-01-11',1) RETURNING id";
      await rejects(insert, [school, cls, foreign], '23503');
      const session = await create(insert, [school, cls, subject]);
      await rejects(insert, [school, cls, subject], '23505');
      const student = await create(
        "INSERT INTO users(role,login,name,password) VALUES('student',$1,'QA','dummy') RETURNING id",
        [randomUUID()]
      );
      await db.query("INSERT INTO students(id,code,first_name,last_name) VALUES($1,$2,'QA','Student')", [
        student,
        randomUUID(),
      ]);
      const enrollment = await create(
        "INSERT INTO enrollments(student_id,class_id,starts) VALUES($1,$2,'2025-01-01') RETURNING id",
        [student, cls]
      );
      const attendance =
        "INSERT INTO attendance(session_id,class_id,student_id,enrollment_id,status) VALUES($1,$2,$3,$4,'present')";
      await db.query(attendance, [session, cls, student, enrollment]);
      await rejects(attendance, [session, cls, student, enrollment], '23505');
    } finally {
      await db.query('ROLLBACK');
      await db.end();
    }
  }
);
