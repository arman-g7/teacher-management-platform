import Link from 'next/link';
import type { User } from '@/lib/auth';
import { rows, sql } from '@/lib/db';
import { settings, type Catalog } from '@/lib/catalog';
import { profile, revokeOtherSessions, markRead } from '@/app/actions';
import { jalali, localDigits } from '@/lib/date';
import { updateNotifications } from '@/lib/notifications';
import { Form, Upload } from './controls';
import { Check, choices, Empty, Hidden, Input, Panel, Select, Table } from './forms';
import { Heading } from './admin-records';

export async function Profile({ user }: { user: User }) {
  const sessions = await rows<{ created_at: Date; expires: Date }>(
    sql`SELECT created_at,expires FROM sessions WHERE user_id=${user.id} AND expires>now() ORDER BY created_at DESC LIMIT 30`
  );
  return (
    <>
      <Heading
        title="نمایه و نشست‌ها"
        description={
          user.must_change
            ? 'برای دسترسی به سامانه، رمز موقت را تغییر دهید.'
            : 'نام نمایشی، رمز عبور و نشست‌های فعال را مدیریت کنید.'
        }
      />
      <Panel title="اطلاعات حساب" detail={'نام کاربری ' + user.login}>
        {user.photo && !user.must_change && (
          <img className="profile-photo" src={'/api/files/' + user.photo} alt={user.name} />
        )}
        <Form action={profile}>
          <Input name="name" label="نام نمایشی" defaultValue={user.name} required />
          {!user.must_change && <Upload name="photo" label="عکس نمایه" accept=".png,.jpg,.jpeg" />}
          <Input
            name="currentPassword"
            label="رمز فعلی"
            type="password"
            autoComplete="current-password"
            required={user.must_change}
          />
          <Input
            name="newPassword"
            label="رمز جدید (حداقل ۱۴ نویسه)"
            type="password"
            autoComplete="new-password"
            minLength={14}
            required={user.must_change}
          />
        </Form>
      </Panel>
      <Panel
        title="نشست‌های فعال"
        action={
          <form action={revokeOtherSessions}>
            <button className="button outline">خروج همهٔ دستگاه‌های دیگر</button>
          </form>
        }
      >
        <Table
          heads={['زمان ورود', 'اعتبار تا']}
          rows={sessions.map((s) => [jalali(s.created_at, true), jalali(s.expires, true)])}
        />
      </Panel>
    </>
  );
}
export async function SettingsPage({ data }: { data: Catalog }) {
  const config = await settings();
  return (
    <>
      <Heading title="تنظیمات" description="ظاهر فضای کاری، کارنامه و گزینه‌های پیش‌فرض را تنظیم کنید." />
      <Panel
        title="شخصی‌سازی"
        action={
          <Link className="button outline" href="/profile">
            نام و عکس معلم
          </Link>
        }
      >
        <Form operation="settings">
          <Input name="title" label="نام سامانه" defaultValue={config.title ?? 'دفتر درس'} required />
          <Select
            name="theme"
            label="پوستهٔ پیش‌فرض"
            choices={choices({ light: 'روشن', dark: 'تیره', system: 'هماهنگ با دستگاه' })}
            value={config.theme ?? 'system'}
          />
          <Input name="header" label="سربرگ کارنامه" defaultValue={config.header} />
          <Input name="footer" label="پاورقی کارنامه" defaultValue={config.footer} />
          <Input
            name="grading"
            label="مقیاس پیش‌فرض کارنامه"
            defaultValue={config.grading ?? 20}
            type="number"
            min={1}
            max={1000}
          />
          <Input
            name="minutes"
            label="مدت پیش‌فرض آزمون"
            defaultValue={config.minutes ?? 45}
            type="number"
            min={1}
            max={480}
          />
          <Select
            name="year"
            label="سال تحصیلی پیش‌فرض"
            choices={data.years}
            value={config.year}
            blank="همهٔ سال‌ها"
          />
          <Check
            name="notifications"
            label="اعلان یادآوری تقویم"
            defaultChecked={config.notifications ?? true}
          />
          <Upload name="logo" label="نشان سامانه" accept=".png,.jpg,.jpeg" previous={config.logo} />
          <Upload name="signature" label="تصویر امضا" accept=".png,.jpg,.jpeg" previous={config.signature} />
        </Form>
      </Panel>
    </>
  );
}
export async function Notifications({ user }: { user: User }) {
  await updateNotifications();
  const list = await rows<{
    id: string;
    title: string;
    path: string;
    created_at: Date;
    read_at: Date | null;
  }>(sql`SELECT * FROM notifications WHERE user_id=${user.id} ORDER BY created_at DESC LIMIT 100`);
  return (
    <>
      <Heading title="اعلان‌ها" description="یادآوری‌ها، آزمون‌های پیش رو و نتیجه‌های تازه." />
      <Panel title={'اعلان‌ها (' + localDigits(list.length) + ')'}>
        {list.length ? (
          <ul className="timeline">
            {list.map((x) => (
              <li key={x.id}>
                <div>
                  <Link className="text-link" href={x.path}>
                    {x.title}
                  </Link>
                  <p>{jalali(x.created_at, true)}</p>
                </div>
                {!x.read_at && (
                  <form action={markRead}>
                    <Hidden id={x.id} />
                    <button className="button outline">علامت‌گذاری به‌عنوان خوانده‌شده</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>هنوز اعلانی برای شما ثبت نشده است.</Empty>
        )}
      </Panel>
    </>
  );
}
