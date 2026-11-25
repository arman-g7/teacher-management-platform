import { dispatchNotifications } from './delivery';
import { db, sql } from './db';
import { eligible, sweepExpired } from './exams';
export async function updateNotifications() {
  await db.execute(sql`INSERT INTO notifications(user_id,topic,title,path)
 SELECT u.id,'event:'||e.id||':'||extract(epoch from e.starts)::bigint,e.title,'/calendar' FROM events e CROSS JOIN users u CROSS JOIN settings s
 WHERE u.role='teacher' AND (s.data->>'notifications') IS DISTINCT FROM 'false'
 AND e.starts>now() AND e.starts-make_interval(mins=>e.reminder)<=now()+interval '1 minute' AND e.reminder>0 ON CONFLICT DO NOTHING`);
  await db.execute(sql`INSERT INTO notifications(user_id,topic,title,path)
 SELECT u.id,'exam:'||e.id,'آزمون پیش رو · '||e.title,'/take/'||e.id FROM exams e CROSS JOIN users u
 WHERE u.active AND u.role='student' AND e.state='published' AND e.publish_at<=now() AND e.ends>now() AND e.starts<=now()+interval '24 hours' AND ${eligible(sql.raw('u.id'))} ON CONFLICT DO NOTHING`);
  await db.execute(sql`INSERT INTO notifications(user_id,topic,title,path)
 SELECT u.id,'grading:'||e.id,'نیازمند تصحیح · '||e.title,'/exams/'||e.id FROM exams e CROSS JOIN users u
 WHERE u.role='teacher' AND EXISTS(SELECT 1 FROM attempts a WHERE a.exam_id=e.id AND a.submitted_at IS NOT NULL AND NOT a.finalized)
 ON CONFLICT DO NOTHING`);
}
export async function maintenance() {
  for (let i = 0; i < 4; i++) if ((await sweepExpired()) < 50) break;
  await updateNotifications();
  await dispatchNotifications();
  await db.execute(sql`DELETE FROM sessions WHERE expires<now()`);
  await db.execute(sql`DELETE FROM rate_limits WHERE until<now()-interval '1 day'`);
}
