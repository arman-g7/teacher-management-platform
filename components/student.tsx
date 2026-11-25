import Link from 'next/link';
import { rows, sql } from '@/lib/db';
import { eligible, type Exam } from '@/lib/exams';
import { jalali, localDigits } from '@/lib/date';
import { Heading } from './admin-records';
import { Empty, Panel } from './forms';

export async function StudentExams({ id, home = false }: { id: string; home?: boolean }) {
  const exams = await rows<
    Pick<Exam, 'id' | 'title' | 'starts' | 'ends' | 'minutes' | 'results_at'> & {
      attempts: number;
      subject: string;
    }
  >(sql`
 SELECT e.id,e.title,e.starts,e.ends,e.minutes,e.results_at,d.name subject,(SELECT count(*)::int FROM attempts a WHERE a.exam_id=e.id AND a.student_id=${id}) attempts
 FROM exams e JOIN subjects d ON d.id=e.subject_id WHERE (e.state='published' AND e.publish_at<=now() AND e.ends>now() AND ${eligible(id)}) OR EXISTS(SELECT 1 FROM attempts a WHERE a.exam_id=e.id AND a.student_id=${id})
 ORDER BY (e.ends>now()) DESC,e.starts DESC LIMIT ${home ? 6 : 100}`);
  return (
    <>
      {!home && (
        <Heading
          title="آزمون‌های من"
          description="آزمون‌های در دسترس، پاسخ‌های ثبت‌شده و نتیجه‌های منتشرشده."
        />
      )}
      <Panel
        title={home ? 'آزمون‌های پیش رو و اخیر' : 'فهرست آزمون‌ها'}
        action={
          home && (
            <Link className="button outline" href="/exams">
              همهٔ آزمون‌ها
            </Link>
          )
        }
      >
        {exams.length ? (
          <div className="grid-cards">
            {exams.map((e) => {
              const now = new Date();
              return (
                <article className="card" key={e.id}>
                  <div className="row spread">
                    <span className="badge">
                      {e.results_at
                        ? 'نتیجه منتشر شده'
                        : e.ends <= now
                          ? 'پایان‌یافته'
                          : e.starts > now
                            ? 'پیش رو'
                            : 'در دسترس'}
                    </span>
                    <small>{e.subject}</small>
                  </div>
                  <h3>{e.title}</h3>
                  <p>
                    {jalali(e.starts, true)} · {localDigits(e.minutes)} دقیقه
                  </p>
                  <Link href={'/take/' + e.id}>مشاهدهٔ آزمون {e.attempts > 0 && 'و برگه‌ها'}</Link>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty>آزمونی برای حساب شما در دسترس نیست.</Empty>
        )}
      </Panel>
    </>
  );
}
