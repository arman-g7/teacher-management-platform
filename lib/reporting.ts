import { sql, rows, one } from './db';
import { gregorian } from './date';
import { uuid } from './forms';
export type Search = Record<string, string | undefined>;
const valid = (x?: string) => (uuid.safeParse(x).success ? x : undefined);
const tryDate = (v?: string) => {
  try {
    return v ? gregorian(v) : undefined;
  } catch {
    return undefined;
  }
};
export function filters(query: Search) {
  return {
    school: valid(query.school),
    classId: valid(query.class),
    year: valid(query.year),
    term: valid(query.term),
    start: tryDate(query.from),
    end: tryDate(query.to),
  };
}
export function where(query: Search, day = sql.raw('h.day')) {
  const x = filters(query);
  return sql`${x.school ? sql`AND c.school_id=${x.school}` : sql``} ${x.classId ? sql`AND c.id=${x.classId}` : sql``}
 ${x.year ? sql`AND c.year_id=${x.year}` : sql``} ${x.term ? sql`AND EXISTS(SELECT 1 FROM terms t WHERE t.id=${x.term} AND t.year_id=c.year_id AND ${day} BETWEEN t.starts AND t.ends)` : sql``}
 ${x.start ? sql`AND ${day}>=${x.start}::date` : sql``} ${x.end ? sql`AND ${day}<=${x.end}::date` : sql``}`;
}
export type AttendanceStat = {
  day: string;
  label: string;
  total: number;
  present: number;
  absent: number;
  excused: number;
  late: number;
  early: number;
};
export function attendanceStats(query: Search) {
  const bucket =
    query.group === 'week'
      ? sql`date_trunc('week',h.day::timestamp + interval '2 days')-interval '2 days'`
      : query.group === 'semester'
        ? sql`coalesce((SELECT min(t.starts) FROM terms t WHERE t.year_id=c.year_id AND h.day BETWEEN t.starts AND t.ends),h.day)`
        : sql`h.day`;
  return rows<AttendanceStat>(sql`WITH d AS (
 SELECT (${bucket})::date AS day,count(*)::int total,count(*) FILTER(WHERE a.status IN ('present','late','early'))::int present,count(*) FILTER(WHERE a.status='absent')::int absent,
 count(*) FILTER(WHERE a.status='excused')::int excused,count(*) FILTER(WHERE a.status='late')::int late,count(*) FILTER(WHERE a.status='early')::int early
 FROM attendance a JOIN attendance_sessions h ON h.id=a.session_id JOIN classes c ON c.id=h.class_id WHERE true ${where(query)} GROUP BY 1 ORDER BY day DESC LIMIT 730)
 SELECT * FROM d ORDER BY day`);
}
export function absenceStats(query: Search) {
  return rows<{ id: string; name: string; total: number; absent: number; streak: number }>(sql`WITH x AS (
 SELECT a.student_id,a.status,sum((a.status<>'absent')::int) OVER(PARTITION BY a.student_id ORDER BY h.day DESC,h.slot DESC,h.id ROWS UNBOUNDED PRECEDING) AS block
 FROM attendance a JOIN attendance_sessions h ON h.id=a.session_id JOIN classes c ON c.id=h.class_id WHERE true ${where(query)})
 SELECT u.id,u.name,count(*)::int total,count(*) FILTER(WHERE x.status='absent')::int absent,count(*) FILTER(WHERE x.status='absent' AND block=0)::int streak
 FROM x JOIN users u ON u.id=x.student_id GROUP BY u.id HAVING count(*) FILTER(WHERE x.status='absent')>0 ORDER BY absent DESC,u.name LIMIT 500`);
}
export function examStats(query: Search) {
  const d = sql`(e.starts AT TIME ZONE 'Asia/Tehran')::date`;
  return rows<{
    id: string;
    title: string;
    day: string;
    cnt: number;
    pending: number;
    avg: number | null;
    high: number | null;
    low: number | null;
    passed: number;
    maximum: number;
  }>(sql`
 SELECT e.id,e.title,${d} AS day,count(a.id) FILTER(WHERE a.finalized)::int cnt,count(a.id) FILTER(WHERE a.submitted_at IS NOT NULL AND NOT a.finalized)::int pending,round(avg(a.score) FILTER(WHERE a.finalized),2)::float8 avg,
 max(a.score) FILTER(WHERE a.finalized)::float8 high,min(a.score) FILTER(WHERE a.finalized)::float8 low,count(a.id) FILTER(WHERE a.finalized AND a.score>=e.passing)::int passed,
 (SELECT sum((q.definition->>'points')::numeric) FROM exam_questions q WHERE q.exam_id=e.id)::float8 maximum
 FROM exams e JOIN classes c ON c.id=e.class_id LEFT JOIN attempts a ON a.exam_id=e.id WHERE e.state<>'draft' ${where(query, d)} GROUP BY e.id ORDER BY e.starts DESC LIMIT 100`);
}
export function gradeStats(query: Search) {
  return rows<{
    id: string;
    name: string;
    class_name: string;
    class_id: string;
    cnt: number;
    mean: number;
  }>(sql`SELECT a.student_id id,u.name,c.name class_name,c.id class_id,count(*)::int cnt,
 round(20*sum(a.score*b.weight/b.maximum)/sum(b.weight),2)::float8 mean
 FROM grades a JOIN assessments b ON b.id=a.assessment_id JOIN classes c ON c.id=a.class_id JOIN users u ON u.id=a.student_id WHERE true ${where(query, sql.raw('b.day'))}
 GROUP BY a.student_id,u.name,c.id ORDER BY mean DESC,u.name LIMIT 500`);
}
export async function studentReport(key: string, teacher: boolean) {
  const [school, attendance, grades, exams, history] = await Promise.all([
    one<{ name: string; code: string; contact: string; school: string; class_name: string; level: string }>(
      sql`SELECT u.name,s.code,s.contact,sc.name school,c.name class_name,c.level FROM students s JOIN users u ON u.id=s.id LEFT JOIN enrollments e ON e.student_id=s.id AND e.ends IS NULL LEFT JOIN classes c ON c.id=e.class_id LEFT JOIN schools sc ON sc.id=c.school_id WHERE s.id=${key}`
    ),
    rows<{ day: string; subject: string; status: string; note: string; class_name: string }>(
      sql`SELECT h.day,d.name subject,a.status,a.note,c.name class_name FROM attendance a JOIN attendance_sessions h ON h.id=a.session_id JOIN subjects d ON d.id=h.subject_id JOIN classes c ON c.id=h.class_id WHERE a.student_id=${key} ORDER BY h.day DESC,h.slot DESC LIMIT 500`
    ),
    rows<{
      day: string;
      title: string;
      subject: string;
      term: string;
      term_id: string;
      year: string;
      score: number;
      maximum: number;
      weight: number;
      feedback: string;
    }>(
      sql`SELECT b.day,b.title,d.name subject,t.name term,t.id term_id,y.name "year",g.score::float8,b.maximum::float8,b.weight::float8,g.feedback FROM grades g JOIN assessments b ON b.id=g.assessment_id JOIN subjects d ON d.id=b.subject_id JOIN terms t ON t.id=b.term_id JOIN years y ON y.id=t.year_id WHERE g.student_id=${key} ${teacher ? sql`` : sql`AND b.published`} ORDER BY b.day DESC LIMIT 500`
    ),
    rows<{ exam: string; title: string; attempt: number; score: number; maximum: number; day: string }>(
      sql`SELECT e.id exam,e.title,a.ordinal attempt,a.score::float8,(SELECT sum((q.definition->>'points')::numeric) FROM exam_questions q WHERE q.exam_id=e.id)::float8 maximum,(a.submitted_at AT TIME ZONE 'Asia/Tehran')::date AS day FROM attempts a JOIN exams e ON e.id=a.exam_id WHERE a.student_id=${key} AND a.finalized ${teacher ? sql`` : sql`AND e.results_at<=now()`} ORDER BY a.submitted_at DESC LIMIT 500`
    ),
    rows<{ class_name: string; school: string; start: string; end: string | null }>(
      sql`SELECT c.name class_name,sc.name school,e.starts AS "start",e.ends AS "end" FROM enrollments e JOIN classes c ON c.id=e.class_id JOIN schools sc ON sc.id=c.school_id WHERE e.student_id=${key} ORDER BY e.starts DESC LIMIT 100`
    ),
  ]);
  return { school, attendance, grades, exams, history };
}
