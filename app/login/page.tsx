import { BookOpen, ArrowLeft, GraduationCap, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { identity } from '@/lib/auth';
import { authenticate } from '@/app/actions';
import { Form } from '@/components/controls';
import { Input } from '@/components/forms';
export default async function Login() {
  if (await identity()) redirect('/');
  return (
    <main className="login">
      <div className="login-art">
        <div className="brand">
          <span>
            <BookOpen size={22} />
          </span>{' '}
          دفتر درس
        </div>
        <div>
          <div className="login-mark">
            <GraduationCap size={64} strokeWidth={1.25} />
          </div>
          <h1>
            هر کلاس، یک دفتر.
            <br />
            همه در یک‌جا.
          </h1>
          <p>مدارس، حضور و غیاب، برنامهٔ تدریس و آزمون‌های آنلاین در یک فضای کاری فارسی.</p>
        </div>
        <div className="login-foot">
          <ShieldCheck size={17} /> فضای آموزشی با دسترسی اختصاصی
        </div>
      </div>
      <div className="login-side">
        <section>
          <div className="overline">
            دفتر درس <ArrowLeft size={14} />
          </div>
          <h2>ورود به سامانه</h2>
          <p>با حساب معلم یا دانش‌آموز وارد شوید.</p>
          <Form action={authenticate} caption="ورود به سامانه">
            <Input label="نام کاربری" name="login" autoComplete="username" required dir="ltr" />
            <Input
              label="رمز عبور"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              dir="ltr"
            />
          </Form>
        </section>
      </div>
    </main>
  );
}
