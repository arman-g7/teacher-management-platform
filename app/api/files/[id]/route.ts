import { get } from '@vercel/blob';
import { identity } from '@/lib/auth';
import { one, sql } from '@/lib/db';
import { uuid } from '@/lib/forms';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await identity();
  const id = uuid.safeParse((await params).id);
  if (!user || user.must_change || !id.success) return new Response(null, { status: 404 });
  const file = await one<{
    owner: string;
    pathname: string;
    mime: string;
    content: Buffer | null;
  }>(sql`SELECT owner,pathname,mime,content FROM files WHERE id=${id.data}
 AND (${user.role}='teacher' OR owner=${user.id} OR id=${user.photo} OR EXISTS (
 SELECT 1 FROM exam_questions q JOIN attempts a ON a.exam_id=q.exam_id WHERE a.student_id=${user.id} AND q.definition->>'attachment'=${id.data}))`);
  if (!file) return new Response(null, { status: 404 });
  const headers = {
    'Content-Type': file.mime,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': file.mime === 'application/pdf' ? 'attachment; filename="document.pdf"' : 'inline',
  };
  if (file.content) return new Response(new Uint8Array(file.content), { headers });
  const blob = await get(file.pathname, { access: 'private' });
  return blob?.statusCode === 200
    ? new Response(blob.stream, { headers })
    : new Response(null, { status: 404 });
}
