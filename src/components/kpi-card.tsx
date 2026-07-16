export function KpiCard({
  label,
  value,
  unit,
  decimals = 0,
  tone = 'default',
}: {
  label: string;
  value: number;
  unit: string;
  decimals?: number;
  tone?: 'default' | 'danger';
}) {
  const display = Number.isFinite(value)
    ? value.toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : '-';
  return (
    <div className={`panel border-l-4 ${tone === 'danger' ? 'border-l-red-600' : 'border-l-brand-700'}`}>
      <div className="mb-1.5 text-xs font-bold text-slate-500">{label}</div>
      <div className={`text-2xl font-extrabold tabular-nums ${tone === 'danger' ? 'text-red-700' : 'text-slate-950'}`}>
        {display} <small className="text-sm font-semibold text-slate-500">{unit}</small>
      </div>
    </div>
  );
}
