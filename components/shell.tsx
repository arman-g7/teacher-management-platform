'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileQuestion,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  School,
  Settings,
  UserRound,
  X,
} from 'lucide-react';
import { logout } from '@/app/actions';
import { ThemeToggle } from './controls';
const teacher = [
  ['/', 'نمای کلی', LayoutDashboard],
  ['/schools', 'مدارس و کلاس‌ها', School],
  ['/students', 'دانش‌آموزان', GraduationCap],
  ['/attendance', 'حضور و غیاب', ClipboardList],
  ['/calendar', 'تقویم کاری', CalendarDays],
  ['/exams', 'آزمون‌ها', FileQuestion],
  ['/questions', 'بانک سؤال', Library],
  ['/grades', 'دفتر نمره', BookOpen],
  ['/reports', 'گزارش‌ها', Activity],
  ['/settings', 'تنظیمات', Settings],
] as const;
const student = [
  ['/', 'خانه', LayoutDashboard],
  ['/exams', 'آزمون‌های من', FileQuestion],
  ['/grades', 'کارنامهٔ من', BookOpen],
] as const;
export function Shell({
  children,
  name,
  role,
  title,
  logo,
  photo,
  theme,
  date,
  unread,
  restricted,
}: {
  children: ReactNode;
  name: string;
  role: 'teacher' | 'student';
  title: string;
  logo?: string;
  photo?: string;
  theme?: string;
  date: string;
  unread: number;
  restricted: boolean;
}) {
  const path = usePathname(),
    [open, setOpen] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem('teacher-theme') ?? theme;
    if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
    else delete document.documentElement.dataset.theme;
  }, [theme]);
  const menu = role === 'teacher' ? teacher : student;
  return (
    <div className="workspace">
      <aside id="workspace-menu" className={'sidebar ' + (open ? 'open' : '')} aria-label="منوی اصلی">
        <Link className="brand" href={restricted ? '/profile' : '/'} onClick={() => setOpen(false)}>
          <span>
            {logo && role === 'teacher' ? <img src={'/api/files/' + logo} alt="" /> : <BookOpen size={21} />}
          </span>
          <div>
            {title}
            <small>{role === 'teacher' ? 'فضای کاری معلم' : 'فضای دانش‌آموزی'}</small>
          </div>
        </Link>
        <nav>
          {!restricted &&
            menu.map(([href, text, Icon]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={(href === '/' ? path === href : path.startsWith(href)) ? 'page' : undefined}
              >
                <Icon size={19} />
                {text}
              </Link>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/profile" onClick={() => setOpen(false)}>
            <UserRound size={18} />
            <div>
              {name}
              <small>نمایه و رمز عبور</small>
            </div>
          </Link>
          <form action={logout}>
            <button type="submit" aria-label="خروج">
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </aside>
      {open && (
        <button className="overlay" type="button" aria-label="بستن منو" onClick={() => setOpen(false)} />
      )}
      <div className="workspace-main">
        <header className="topbar">
          <div>
            <button
              type="button"
              className="icon-button menu-toggle"
              aria-expanded={open}
              aria-controls="workspace-menu"
              aria-label="منو"
              onClick={() => setOpen(!open)}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="header-date">
              <CalendarDays size={16} />
              {date}
            </span>
          </div>
          <div>
            <ThemeToggle />
            {!restricted && (
              <Link
                className="icon-button notification-indicator"
                href="/notifications"
                aria-label="اعلان‌ها"
              >
                <Bell size={19} />
                {unread > 0 && <i />}
              </Link>
            )}
            <Link className="icon-button avatar" href="/profile" aria-label="نمایه">
              {photo && !restricted ? <img src={'/api/files/' + photo} alt="" /> : Array.from(name)[0]}
            </Link>
          </div>
        </header>
        <main className="page" id="main">
          {children}
        </main>
        <footer className="workspace-footer">
          {title} <span>مدیریت آموزش</span>
        </footer>
      </div>
    </div>
  );
}
