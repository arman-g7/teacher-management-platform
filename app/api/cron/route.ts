import { timingSafeEqual } from 'node:crypto';
import { digest } from '@/lib/password';
import { maintenance } from '@/lib/notifications';
export const maxDuration = 60;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    !timingSafeEqual(
      Buffer.from(digest(req.headers.get('authorization') ?? '')),
      Buffer.from(digest('Bearer ' + secret))
    )
  )
    return new Response(null, { status: 401 });
  await maintenance();
  return Response.json({ ok: true });
}
