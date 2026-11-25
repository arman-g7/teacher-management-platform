import { one, sql, db } from './db';
type Channel = 'email' | 'sms';
type Message = { id: string; recipient: string; title: string; path: string; channel: Channel };
function config(channel: Channel) {
  const value = channel === 'email' ? process.env.EMAIL_WEBHOOK_URL : process.env.SMS_WEBHOOK_URL;
  const token = channel === 'email' ? process.env.EMAIL_WEBHOOK_TOKEN : process.env.SMS_WEBHOOK_TOKEN;
  if (!value || !token || !process.env.APP_ORIGIN) return;
  try {
    const endpoint = new URL(value);
    if (endpoint.protocol === 'https:') return { endpoint, token, origin: new URL(process.env.APP_ORIGIN) };
  } catch {}
}
async function next(channel: Channel) {
  return db.transaction(async (tx) => {
    const item = await one<Message>(
      sql`SELECT n.id,n.title,n.path,d.channel,
    CASE WHEN d.channel='email' THEN u.login ELSE s.contact END recipient
    FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id JOIN users u ON u.id=n.user_id
    LEFT JOIN students s ON s.id=u.id WHERE d.channel=${channel} AND d.sent_at IS NULL AND d.attempts<6 AND d.retry_at<=now()
    ORDER BY d.retry_at LIMIT 1 FOR UPDATE OF d SKIP LOCKED`,
      tx
    );
    if (item)
      await tx.execute(sql`UPDATE notification_deliveries SET attempts=attempts+1,retry_at=now()+make_interval(mins=>15*(attempts+1))
    WHERE notification_id=${item.id} AND channel=${channel}`);
    return item;
  });
}
export async function dispatchNotifications() {
  for (const channel of ['email', 'sms'] as const) {
    const provider = config(channel);
    if (!provider) continue;
    await db.execute(sql`INSERT INTO notification_deliveries(notification_id,channel)
   SELECT n.id,${channel} FROM notifications n JOIN users u ON u.id=n.user_id LEFT JOIN students s ON s.id=u.id
   WHERE u.active AND n.created_at>now()-interval '7 days' AND (n.topic LIKE 'exam:%' OR n.topic LIKE 'event:%' OR n.topic LIKE 'result:%')
   AND CASE WHEN ${channel}='email' THEN position('@' in u.login)>1 ELSE coalesce(s.contact,'') ~ '^\\+?[0-9]{8,15}$' END
   ON CONFLICT DO NOTHING`);
    for (let i = 0; i < 8; i++) {
      const item = await next(channel);
      if (!item) break;
      try {
        const response = await fetch(provider.endpoint, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(2500),
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + provider.token,
            'Idempotency-Key': item.id + ':' + channel,
          },
          body: JSON.stringify({
            recipient: item.recipient,
            notificationId: item.id,
            link: new URL(item.path, provider.origin).href,
          }),
        });
        if (response.ok)
          await db.execute(
            sql`UPDATE notification_deliveries SET sent_at=now() WHERE notification_id=${item.id} AND channel=${channel}`
          );
      } catch {
        /* The claim retains its retry time if delivery is unavailable. */
      }
    }
  }
}
