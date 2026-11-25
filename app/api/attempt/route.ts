import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { identity, limit } from '@/lib/auth';
import { startAttempt, syncAttempt } from '@/lib/exams';
import { InputError } from '@/lib/forms';
import { sameOrigin } from '@/lib/http';
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), id: z.uuid(), code: z.string().max(40).default('') }),
  z.object({
    action: z.literal('sync'),
    id: z.uuid(),
    submit: z.boolean(),
    answers: z
      .array(
        z.object({
          id: z.uuid(),
          value: z.unknown(),
          flag: z.boolean(),
          revision: z.number().int().min(1).max(2147483647),
        })
      )
      .max(100),
  }),
]);
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'مبدأ درخواست معتبر نیست.' }, { status: 403 });
  const user = await identity();
  if (user?.role !== 'student' || user.must_change)
    return NextResponse.json({ error: 'دسترسی مجاز نیست.' }, { status: 403 });
  if (!(await limit('attempt:' + user.id, 180, 60)))
    return NextResponse.json({ error: 'تعداد درخواست‌ها بیش از حد مجاز است.' }, { status: 429 });
  try {
    const text = await req.text();
    if (text.length > 1600000)
      return NextResponse.json({ error: 'درخواست بیش از حد بزرگ است.' }, { status: 413 });
    const data = schema.parse(JSON.parse(text));
    return NextResponse.json(
      data.action === 'start'
        ? { id: await startAttempt(data.id, user.id, data.code) }
        : await syncAttempt(data.id, user.id, data.answers, data.submit)
    );
  } catch (error) {
    const handled =
      error instanceof InputError || error instanceof z.ZodError || error instanceof SyntaxError;
    if (!handled) console.error('attempt operation failed', (error as Error).name);
    return NextResponse.json(
      {
        error:
          error instanceof InputError
            ? error.message
            : handled
              ? 'ساختار درخواست معتبر نیست.'
              : 'ثبت پاسخ انجام نشد.',
      },
      { status: handled ? 400 : 500 }
    );
  }
}
