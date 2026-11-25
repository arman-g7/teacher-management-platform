import { jalaliInput, localDigits } from './date';
import type { AttendanceStat } from './reporting';
export function groupMonth(data: AttendanceStat[], group?: string) {
  if (group !== 'month') return data;
  const groups = new Map<string, AttendanceStat>();
  for (const row of data) {
    const month = jalaliInput(row.day).slice(0, 7),
      old = groups.get(month);
    if (!old) groups.set(month, { ...row, label: localDigits(month) });
    else
      for (const key of ['total', 'present', 'absent', 'excused', 'late', 'early'] as const)
        old[key] += row[key];
  }
  return [...groups.values()];
}
