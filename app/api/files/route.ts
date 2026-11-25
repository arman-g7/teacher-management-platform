import { randomUUID } from 'node:crypto';
import { put, del } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { identity, limit } from '@/lib/auth';
import { db, sql } from '@/lib/db';
import { sameOrigin } from '@/lib/http';

export async function POST(req: NextRequest) {
  const user = await identity();
  if (!user || user.must_change || !sameOrigin(req))
    return NextResponse.json({ error: 'دسترسی مجاز نیست.' }, { status: 403 });
  if (!(await limit('file:' + user.id, 30, 3600)))
    return NextResponse.json({ error: 'سقف ارسال فایل پر شده است.' }, { status: 429 });
  if (Number(req.headers.get('content-length') || 0) > 3100000)
    return NextResponse.json({ error: 'حداکثر اندازهٔ فایل ۳ مگابایت است.' }, { status: 413 });
  let pathname: string | undefined;
  try {
    const file = (await req.formData()).get('file');
    if (!(file instanceof File) || file.size < 5 || file.size > 3000000)
      return NextResponse.json({ error: 'اندازهٔ فایل مجاز نیست.' }, { status: 400 });
    const data = Buffer.from(await file.arrayBuffer());
    let mime = '';
    if (data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) mime = 'image/png';
    if (data.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) mime = 'image/jpeg';
    if (data.subarray(0, 5).toString() === '%PDF-') mime = 'application/pdf';
    if (!mime)
      return NextResponse.json({ error: 'فقط فایل PNG، JPG و PDF پذیرفته می‌شود.' }, { status: 400 });
    const key = randomUUID(),
      name = file.name.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 140) || 'attachment';
    const remote = !!process.env.BLOB_READ_WRITE_TOKEN;
    if (remote)
      pathname = (
        await put('private/' + key, data, { access: 'private', contentType: mime, addRandomSuffix: false })
      ).pathname;
    await db.execute(
      sql`INSERT INTO files(id,owner,pathname,name,mime,bytes,content) VALUES (${key},${user.id},${pathname || 'db/' + key},${name},${mime},${data.length},${remote ? null : data})`
    );
    return NextResponse.json({ id: key, name });
  } catch (error) {
    if (pathname) await del(pathname).catch(() => undefined);
    console.error('upload failed', (error as Error).name);
    return NextResponse.json({ error: 'بارگذاری انجام نشد.' }, { status: 500 });
  }
}
