import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/vazirmatn';
import 'katex/dist/katex.min.css';
import './style.css';
export const metadata: Metadata = {
  title: 'دفتر درس',
  description: 'سامانهٔ مدیریت آموزش، کلاس و آزمون آنلاین',
  robots: { index: false, follow: false },
};
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
