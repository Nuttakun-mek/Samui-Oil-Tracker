export function TankGauge({
  label,
  liters,
  capacity,
  pct,
}: {
  label: string;
  liters: number;
  capacity: number;
  pct: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const status = clamped < 15 ? 'danger' : clamped < 35 ? 'warn' : 'ok';
  const fillColor = { ok: '#0E7C86', warn: '#C97A0C', danger: '#B23A1B' }[status];
  const statusText = { ok: 'ปกติ', warn: 'เฝ้าระวัง', danger: 'วิกฤต' }[status];
  const statusClass = {
    ok: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-700',
  }[status];

  return (
    <div className="panel">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-extrabold leading-5 text-slate-950">{label}</div>
          <div className="mt-0.5 text-xs text-slate-500">ความจุ {Math.round(capacity).toLocaleString('th-TH')} ลิตร</div>
        </div>
        <span className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold ${statusClass}`}>
          {statusText}
        </span>
      </div>

      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="text-3xl font-extrabold text-slate-950 tabular-nums">{clamped.toFixed(0)}%</div>
        <div className="text-right text-xs text-slate-500 tabular-nums">
          <div className="font-bold text-slate-700">{Math.round(liters).toLocaleString('th-TH')}</div>
          <div>ลิตรคงเหลือ</div>
        </div>
      </div>

      <div className="h-3 overflow-hidden rounded-md bg-slate-100">
        <div
          className="h-full rounded-md transition-all duration-500"
          style={{ width: `${clamped}%`, background: fillColor }}
        />
      </div>
    </div>
  );
}
