import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type Catalog } from '@/lib/catalog';
import { type CalendarEvent, calendarWindow, eventDays, events, timeLabel } from '@/lib/calendar';
import { eventKinds } from '@/lib/teacher';
import { one, sql } from '@/lib/db';
import { dayInTehran, gregorian, jalali, jalaliInput, ZONE } from '@/lib/date';
import { Heading, Disclosure, pathFor, valid } from './admin-records';
import { Form, JalaliField } from './controls';
import { DateTime, Hidden, Input, Panel, Select, Table, choices } from './forms';
import { CalendarGrid } from './calendar-grid';

const views = { day: 'روزانه', week: 'هفتگی', month: 'ماهانه' };
function EventForm({ data, item }: { data: Catalog; item?: CalendarEvent }) {
  return (
    <Form operation="event" reset={!item}>
      <Hidden id={item?.id} />
      <Input name="title" label="عنوان رویداد" defaultValue={item?.title} required />
      <Select name="kind" label="نوع رویداد" choices={choices(eventKinds)} value={item?.kind ?? 'lesson'} />
      <Select
        name="school"
        label="مدرسه"
        choices={data.schools}
        value={item?.school_id ?? undefined}
        blank="شخصی"
      />
      <Select
        name="class"
        label="کلاس"
        choices={data.classes}
        value={item?.class_id ?? undefined}
        blank="بدون کلاس"
      />
      <DateTime name="start" label="شروع" value={item?.starts} />
      <DateTime name="end" label="پایان" value={item?.ends} />
      <Input name="color" label="رنگ" type="color" defaultValue={item?.color ?? '#5947b1'} />
      <Input
        name="reminder"
        label="یادآوری چند دقیقه قبل"
        type="number"
        min={0}
        max={10080}
        defaultValue={item?.reminder ?? 30}
        required
      />
      {!item && (
        <Input
          name="repeat"
          label="تعداد تکرار هفتگی"
          type="number"
          min={1}
          max={24}
          defaultValue={1}
          required
        />
      )}
    </Form>
  );
}
export async function CalendarPage({
  data,
  query,
  detail,
}: {
  data: Catalog;
  query: Record<string, string | undefined>;
  detail?: string;
}) {
  if (detail) {
    const item = valid(detail)
      ? await one<CalendarEvent>(sql`SELECT *,false AS is_exam FROM events WHERE id=${detail}`)
      : undefined;
    if (!item) notFound();
    return (
      <>
        <Heading
          title={item.title}
          description={jalali(item.starts, true) + ' · ' + eventKinds[item.kind]}
          action={
            <Link href="/calendar" className="button outline">
              بازگشت به تقویم
            </Link>
          }
        />
        <Panel title="جزئیات رویداد">
          <EventForm data={data} item={item} />
          <Disclosure title="حذف رویداد">
            <Form operation="eventDelete" caption="حذف رویداد">
              <Hidden id={item.id} />
            </Form>
          </Disclosure>
        </Panel>
      </>
    );
  }
  let day = dayInTehran();
  try {
    if (query.day) day = gregorian(query.day);
  } catch {}
  const view = query.view === 'day' || query.view === 'week' ? query.view : 'month',
    win = calendarWindow(day, view);
  const items = await events(win.start, win.end, valid(query.school), valid(query.class));
  const title =
    view === 'month'
      ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
          month: 'long',
          year: 'numeric',
          timeZone: ZONE,
        }).format(new Date(day + 'T12:00:00Z'))
      : jalali(win.start) + (view === 'week' ? ' تا ' + jalali(win.days.at(-1)!) : '');
  return (
    <>
      <Heading
        title="تقویم کاری"
        description="برنامهٔ تدریس، آزمون‌ها و کارهای شخصی در تقویم شمسی."
        action={
          <Link href="/calendar" className="button outline">
            امروز
          </Link>
        }
      />
      <Panel
        title={title}
        action={
          <div className="row">
            <Link
              aria-label="بازهٔ قبل"
              className="icon-button"
              href={pathFor('/calendar', { ...query, view, day: jalaliInput(win.previous) })}
            >
              <ChevronRight size={18} />
            </Link>
            <Link
              aria-label="بازهٔ بعد"
              className="icon-button"
              href={pathFor('/calendar', { ...query, view, day: jalaliInput(win.next) })}
            >
              <ChevronLeft size={18} />
            </Link>
          </div>
        }
      >
        <div className="stack">
          <form className="filter no-print">
            <Select name="view" label="نمای تقویم" choices={choices(views)} value={view} />
            <Select name="school" label="مدرسه" choices={data.schools} value={query.school} blank="همه" />
            <Select name="class" label="کلاس" choices={data.classes} value={query.class} blank="همه" />
            <JalaliField name="day" label="تاریخ تقویم" value={jalaliInput(day)} />
            <button className="button primary">نمایش تقویم</button>
          </form>
          {view !== 'day' && (
            <CalendarGrid
              days={eventDays(items, win.days)}
              offset={win.offset}
              today={dayInTehran()}
              editable
            />
          )}
        </div>
      </Panel>
      <Panel title="برنامهٔ این بازه">
        <Table
          heads={['رویداد', 'نوع', 'تاریخ', 'شروع', 'پایان']}
          rows={items.map((x) => [
            <Link className="text-link" href={(x.is_exam ? '/exams/' : '/calendar/') + x.id}>
              <span className="event-dot" style={{ background: x.color }} />
              {x.title}
            </Link>,
            eventKinds[x.kind],
            jalali(x.starts),
            timeLabel(x.starts),
            jalali(x.ends, true),
          ])}
        />
      </Panel>
      <Panel title="رویداد جدید">
        <Disclosure title="افزودن به تقویم">
          <EventForm data={data} />
        </Disclosure>
      </Panel>
    </>
  );
}
