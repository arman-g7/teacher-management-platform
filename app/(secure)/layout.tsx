import type { ReactNode } from 'react';
import { requireUser } from '@/lib/auth';
import { settings } from '@/lib/catalog';
import { one, sql } from '@/lib/db';
import { jalali } from '@/lib/date';
import { Shell } from '@/components/shell';
export const dynamic = 'force-dynamic';
export default async function SecureLayout({ children }: { children: ReactNode }) {
  const user = await requireUser(undefined, true);
  const config = await settings();
  const unread = user.must_change
    ? 0
    : ((
        await one<{ count: number }>(
          sql`SELECT count(*)::int AS count FROM notifications WHERE user_id=${user.id} AND read_at IS NULL`
        )
      )?.count ?? 0);
  return (
    <Shell
      name={user.name}
      role={user.role}
      title={config.title || 'دفتر درس'}
      logo={config.logo}
      photo={user.photo ?? undefined}
      theme={config.theme}
      date={jalali(new Date())}
      unread={unread}
      restricted={user.must_change}
    >
      {children}
    </Shell>
  );
}
