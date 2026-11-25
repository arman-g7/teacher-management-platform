import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { catalog } from '@/lib/catalog';
import { queryOf } from '@/lib/query';
import { Attendance, Gradebook, Schools, Students } from '@/components/admin-records';
import { ExamsAdmin, QuestionBank } from '@/components/exam-admin';
import { CalendarPage } from '@/components/calendar-page';
import { Reports, StudentReport } from '@/components/reports';
import { StudentExams } from '@/components/student';
import { Notifications, Profile, SettingsPage } from '@/components/account';
type Params = { section: string; detail?: string[] };
export default async function Section({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section, detail = [] } = await params,
    query = queryOf(await searchParams),
    user = await requireUser(undefined, section === 'profile');
  if (detail.length > (section === 'exams' ? 2 : 1)) notFound();
  if (section === 'profile' && !detail.length) return <Profile user={user} />;
  if (section === 'notifications' && !detail.length) return <Notifications user={user} />;
  if (user.role === 'student') {
    if (section === 'exams' && !detail.length) return <StudentExams id={user.id} />;
    if (section === 'grades' && !detail.length) return <StudentReport id={user.id} />;
    notFound();
  }
  if (
    ![
      'schools',
      'students',
      'attendance',
      'calendar',
      'exams',
      'questions',
      'grades',
      'reports',
      'settings',
    ].includes(section)
  )
    notFound();
  const data = await catalog(),
    key = detail[0];
  switch (section) {
    case 'schools':
      if (!key) return <Schools data={data} />;
      break;
    case 'students':
      return <Students data={data} detail={key} query={query} />;
    case 'attendance':
      return <Attendance data={data} detail={key} query={query} />;
    case 'calendar':
      return <CalendarPage data={data} detail={key} query={query} />;
    case 'exams':
      return <ExamsAdmin data={data} detail={key} attemptId={detail[1]} query={query} />;
    case 'questions':
      return <QuestionBank data={data} detail={key} query={query} />;
    case 'grades':
      return <Gradebook data={data} detail={key} />;
    case 'reports':
      if (!key) return <Reports data={data} query={query} />;
      break;
    case 'settings':
      if (!key) return <SettingsPage data={data} />;
      break;
  }
  notFound();
}
