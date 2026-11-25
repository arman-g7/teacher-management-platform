import type { NextRequest } from 'next/server';
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const configured = process.env.APP_ORIGIN;
  try {
    if (configured) return new URL(configured).origin === origin;
    if (process.env.VERCEL_URL && origin === 'https://' + process.env.VERCEL_URL) return true;
    return origin === req.nextUrl.origin;
  } catch {
    return false;
  }
}
