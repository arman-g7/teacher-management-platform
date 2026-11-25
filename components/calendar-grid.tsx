'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { mutate } from '@/app/actions';
import { jalaliInput, localDigits } from '@/lib/date';
import type { CalendarEvent } from '@/lib/calendar';

export function CalendarGrid({
  days,
  offset,
  today,
  editable = false,
}: {
  days: { day: string; items: CalendarEvent[] }[];
  offset: number;
  today: string;
  editable?: boolean;
}) {
  const router = useRouter(),
    [status, setStatus] = useState<{ error?: string; success?: string }>({}),
    [, transition] = useTransition();
  return (
    <>
      <div className="calendar-grid">
        {['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'].map((day) => (
          <div className="calendar-weekday" key={day}>
            {day}
          </div>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <div aria-hidden key={'offset' + i} />
        ))}
        {days.map(({ day, items }) => (
          <div
            className={'calendar-cell ' + (day === today ? 'today' : '')}
            key={day}
            onDragOver={(e) => {
              if (editable) e.preventDefault();
            }}
            onDrop={(e) => {
              if (!editable) return;
              e.preventDefault();
              const key = e.dataTransfer.getData('text/plain');
              if (!key) return;
              const form = new FormData();
              form.set('action', 'eventMove');
              form.set('id', key);
              form.set('day', jalaliInput(day));
              transition(async () => {
                const result = await mutate({}, form);
                setStatus(result);
                if (result.success) router.refresh();
              });
            }}
          >
            <Link
              className="calendar-day"
              href={'/calendar?view=day&day=' + encodeURIComponent(jalaliInput(day))}
            >
              {localDigits(Number(jalaliInput(day).slice(-2)))}
            </Link>
            {items.slice(0, 3).map((event) => (
              <Link
                key={event.id}
                href={event.is_exam ? '/exams/' + event.id : '/calendar/' + event.id}
                title={event.title}
                draggable={editable && !event.is_exam}
                onDragStart={(e) => {
                  if (!event.is_exam) e.dataTransfer.setData('text/plain', event.id);
                }}
                className="calendar-chip"
              >
                <span className="dot" style={{ background: event.color }} />
                {event.title}
              </Link>
            ))}
          </div>
        ))}
      </div>
      {status.error && <p role="alert">{status.error}</p>}
      {status.success && <p role="status">{status.success}</p>}
    </>
  );
}
