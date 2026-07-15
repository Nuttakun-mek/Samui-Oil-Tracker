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
    <div className="panel flex items-center gap-4">
      <div className="relative w-14 h-28 border-2 border-navy rounded-md overflow-hidden bg-white shrink-0">
        <div
          className="absolute bottom-0 left-0 w-full transition-all duration-500"
          style={{ height: `${clamped}%`, background: fillColor }}
        />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-bold uppercase tracking-wide text-muted mb-1">{label}</div>
        <div className="text-3xl font-extrabold text-navy tabular-nums">{clamped.toFixed(0)}%</div>
        <div className="text-xs text-muted tabular-nums mt-1">
          {Math.round(liters).toLocaleString('th-TH')} / {Math.round(capacity).toLocaleString('th-TH')} ลิตร
        </div>
        <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${statusClass}`}>
          {statusText}
        </span>
      </div>
    </div>
  );
}
