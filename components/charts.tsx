'use client';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { localDigits } from '@/lib/date';
const labels = { presence: 'حضور', score: 'نمره', count: 'تعداد' } as const;
export function MetricsChart({
  data,
  metric,
  line = false,
}: {
  data: { label: string; value: number }[];
  metric: keyof typeof labels;
  line?: boolean;
}) {
  const children = (
    <>
      <CartesianGrid vertical={false} stroke="var(--line)" />
      <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickMargin={8} />
      <YAxis tickFormatter={localDigits} tick={{ fontSize: 11, fill: 'var(--muted)' }} width={38} />
      <Tooltip
        labelStyle={{ color: 'var(--ink)' }}
        contentStyle={{
          direction: 'rtl',
          background: 'var(--panel)',
          borderColor: 'var(--line)',
          borderRadius: '10px',
        }}
        formatter={(v) => [localDigits(String(v ?? 0)), labels[metric]]}
      />
    </>
  );
  return (
    <div className="chart" role="img" aria-label={'نمودار ' + labels[metric]}>
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        initialDimension={{ width: 320, height: 270 }}
      >
        {line ? (
          <LineChart data={data} margin={{ right: 16, top: 8 }}>
            {children}
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--brand)"
              strokeWidth={3}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ right: 8, top: 8 }}>
            {children}
            <Bar
              dataKey="value"
              fill="var(--brand)"
              radius={[5, 5, 0, 0]}
              maxBarSize={35}
              isAnimationActive={false}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
