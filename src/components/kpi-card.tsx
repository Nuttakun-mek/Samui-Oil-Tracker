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
  const display = Number.isFinite(value) ? value.toFixed(decimals) : '-';
  return (
    <div className="panel">
      <div className="text-xs font-semibold text-muted mb-1.5">{label}</div>
      <div className={`text-2xl font-extrabold tabular-nums ${tone === 'danger' ? 'text-red-700' : 'text-navy'}`}>
        {display} <small className="text-sm font-semibold text-muted">{unit}</small>
      </div>
    </div>
  );
}
