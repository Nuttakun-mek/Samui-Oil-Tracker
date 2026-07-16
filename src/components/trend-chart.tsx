'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS: Record<string, string> = {
  samui: '#722257',
  phangan: '#C69214',
  koh_tao: '#475569',
};

interface Series {
  id: string;
  label: string;
  points: { date: string; value: number }[];
}

export function TrendChart({ data }: { data: Series[] }) {
  // รวมทุกวันที่จากทุกสถานีเป็นแกน x เดียวกัน
  const dateSet = new Set<string>();
  data.forEach((s) => s.points.forEach((p) => dateSet.add(p.date)));
  const dates = Array.from(dateSet).sort();

  const merged = dates.map((date) => {
    const row: Record<string, string | number | null> = { date };
    data.forEach((s) => {
      const point = s.points.find((p) => p.date === date);
      row[s.id] = point ? point.value : null;
    });
    return row;
  });

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={merged} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} minTickGap={30} />
          <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(v) => v.toLocaleString('th-TH')} width={56} />
          <Tooltip formatter={(v: number) => v.toLocaleString('th-TH') + ' ลิตร'} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {data.map((s) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.label}
              stroke={COLORS[s.id] ?? '#722257'}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
