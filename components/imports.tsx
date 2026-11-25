'use client';
import { useState } from 'react';
const columns = ['login', 'password', 'code', 'first', 'last', 'contact', 'guardian', 'notes'];

export function ImportStudents() {
  const [payload, setPayload] = useState(''),
    [status, setStatus] = useState('');
  async function read(file: File) {
    setPayload('');
    setStatus('در حال خواندن…');
    try {
      if (file.size > 2000000) throw new Error('سقف فایل ۲ مگابایت است.');
      if (file.name.toLowerCase().endsWith('.csv')) {
        const { parseCsv } = await import('@/lib/csv');
        const matrix = parseCsv(await file.text());
        const [head, ...rows] = matrix;
        convert(head, rows);
      } else {
        const { default: ExcelJS } = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error('برگه‌ای در فایل وجود ندارد.');
        const matrix: string[][] = [];
        sheet.eachRow({ includeEmpty: false }, (row) => {
          matrix.push(Array.from({ length: Math.min(row.cellCount, 30) }, (_, i) => row.getCell(i + 1).text));
        });
        const [head, ...rows] = matrix;
        convert(head, rows);
      }
    } catch (error) {
      setStatus((error as Error).message || 'فایل معتبر نیست.');
    }
  }
  function convert(head: string[] | undefined, rows: string[][]) {
    if (!head || !columns.slice(0, 5).every((c) => head.includes(c)))
      throw new Error('عنوان ستون‌های ضروری را بررسی کنید.');
    if (rows.length < 1 || rows.length > 100) throw new Error('هر فایل باید ۱ تا ۱۰۰ دانش‌آموز داشته باشد.');
    setPayload(
      JSON.stringify(
        rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[head.indexOf(c)] ?? ''])))
      )
    );
    setStatus('فایل آمادهٔ ثبت است.');
  }
  return (
    <div className="full stack">
      <p>
        ستون‌های ضروری <bdi dir="ltr">login, password, code, first, last</bdi> و ستون‌های اختیاری{' '}
        <bdi dir="ltr">contact, guardian, notes</bdi> هستند. رمز موقت حداقل ۱۴ نویسه باشد.
      </p>
      <label className="field">
        <span>فایل ورود گروهی</span>
        <input
          type="file"
          accept=".csv,.xlsx"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void read(file);
          }}
        />
      </label>
      <input type="hidden" name="payload" value={payload} />
      <p role="status">{status}</p>
    </div>
  );
}
