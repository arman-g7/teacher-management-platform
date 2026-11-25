import { sql, rows } from './db';
import { gregorian, jalaliInput, dayInTehran, ZONE } from './date';
import type { eventKinds } from './teacher';
export type CalendarEvent = {
  id: string;
  school_id: string | null;
  class_id: string | null;
  title: string;
  kind: keyof typeof eventKinds;
  starts: Date;
  ends: Date;
  color: string;
  reminder: number;
  is_exam: boolean;
};
export function addDays(day: string, delta: number) {
  return new Date(Date.parse(day + 'T12:00:00Z') + delta * 86400000).toISOString().slice(0, 10);
}
export function calendarWindow(day: string, mode: string) {
  if (mode === 'day')
    return {
      start: day,
      end: addDays(day, 1),
      days: [day],
      previous: addDays(day, -1),
      next: addDays(day, 1),
      offset: 0,
    };
  if (mode === 'week') {
    const start = addDays(day, -((new Date(day + 'T12:00:00Z').getUTCDay() + 1) % 7));
    return {
      start,
      end: addDays(start, 7),
      days: Array.from({ length: 7 }, (_, i) => addDays(start, i)),
      previous: addDays(start, -7),
      next: addDays(start, 7),
      offset: 0,
    };
  }
  const [year, month] = jalaliInput(day).split('/').map(Number);
  const start = gregorian(year + '/' + month + '/1'),
    end = gregorian((month === 12 ? year + 1 : year) + '/' + (month === 12 ? 1 : month + 1) + '/1');
  const count = Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
  return {
    start,
    end,
    days: Array.from({ length: count }, (_, i) => addDays(start, i)),
    previous: addDays(start, -1),
    next: end,
    offset: (new Date(start + 'T12:00:00Z').getUTCDay() + 1) % 7,
  };
}
export function events(start: string, end: string, school?: string, cls?: string) {
  return rows<CalendarEvent>(sql`SELECT id,school_id,class_id,title,kind,starts,ends,color,reminder,false AS is_exam FROM events
 WHERE starts<(${end}::date::timestamp AT TIME ZONE 'Asia/Tehran') AND ends>(${start}::date::timestamp AT TIME ZONE 'Asia/Tehran')
 ${school ? sql`AND school_id=${school}` : sql``} ${cls ? sql`AND class_id=${cls}` : sql``}
 UNION ALL SELECT id,school_id,class_id,title,'exam',starts,ends,'#9561ba',0,true FROM exams
 WHERE state='published' AND starts<(${end}::date::timestamp AT TIME ZONE 'Asia/Tehran') AND ends>(${start}::date::timestamp AT TIME ZONE 'Asia/Tehran')
 ${school ? sql`AND school_id=${school}` : sql``} ${cls ? sql`AND class_id=${cls}` : sql``}
 ORDER BY starts LIMIT 500`);
}
export const timeLabel = (date: Date) =>
  new Intl.DateTimeFormat('fa-IR', {
    timeZone: ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
export function eventDays(items: CalendarEvent[], days: string[]) {
  return days.map((day) => ({
    day,
    items: items.filter(
      (x) => dayInTehran(x.starts) <= day && dayInTehran(new Date(x.ends.getTime() - 1)) >= day
    ),
  }));
}
