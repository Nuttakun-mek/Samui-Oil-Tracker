import { formatThaiDate } from '@/lib/format/thai-date';

export function TankGauge({
  label,
  liters,
  capacity,
  pct,
  averageDailyUsage,
  daysRemaining,
  etaDate,
  lowStockDays,
}: {
  label: string;
  liters: number;
  capacity: number;
  pct: number;
  averageDailyUsage: number;
  daysRemaining: number | null;
  etaDate: string | null;
  lowStockDays: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  // สีตามสัดส่วนน้ำมันในถัง: มากกว่า 60% เขียว, มากกว่า 40% เหลือง, ต่ำกว่านั้นแดง
  const status = clamped > 60 ? 'ok' : clamped > 40 ? 'warn' : 'danger';
  const fillColor = { ok: '#15803D', warn: '#C69214', danger: '#B23A1B' }[status];
  const statusText = { ok: 'ปกติ', warn: 'เฝ้าระวัง', danger: 'วิกฤต' }[status];
  const statusClass = {
    ok: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-gold-50 text-gold-700',
    danger: 'bg-red-50 text-red-700',
  }[status];
  // จำนวนวันเหลือยังเตือนตามเกณฑ์วัน (คนละเรื่องกับสัดส่วนถัง — ถังเกือบเต็มแต่ใช้เร็วก็หมดไวได้)
  const daysCritical = daysRemaining !== null && daysRemaining < lowStockDays;

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

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
        <div>
          <dt className="text-xs font-semibold text-slate-500">ใช้เฉลี่ย/วัน</dt>
          <dd className="mt-0.5 text-base font-extrabold tabular-nums text-slate-900">
            {Math.round(averageDailyUsage).toLocaleString('th-TH')} <span className="text-xs font-semibold text-slate-500">ลิตร</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate-500">คาดว่าใช้ได้อีก</dt>
          <dd className={`mt-0.5 text-base font-extrabold tabular-nums ${daysCritical ? 'text-red-700' : 'text-slate-900'}`}>
            {daysRemaining === null ? '-' : daysRemaining.toLocaleString('th-TH', { maximumFractionDigits: 1 })} <span className="text-xs font-semibold text-slate-500">วัน</span>
          </dd>
          {etaDate && <dd className="mt-0.5 text-xs font-semibold text-slate-500">คาดหมดวันที่ {formatThaiDate(etaDate)}</dd>}
        </div>
      </dl>
      <p className="mt-2 text-[11px] leading-4 text-slate-500">คำนวณจากยอดคงเหลือ ÷ ยอดใช้เฉลี่ย 7 วันที่มีบันทึกล่าสุด</p>
    </div>
  );
}
