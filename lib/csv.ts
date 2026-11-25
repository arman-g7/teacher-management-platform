export function parseCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false;
  const text = input.replace(/^\ufeff/, '').replace(/\r\n/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if (char === '\n' && !quoted) {
      row.push(value);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }
  if (quoted) throw new Error('علامت نقل‌قول در CSV بسته نشده است.');
  row.push(value);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
