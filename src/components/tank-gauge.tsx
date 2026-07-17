import { AlertCircle } from 'lucide-react';
import { formatThaiDate } from '@/lib/format/thai-date';

// นับจำนวนวันนับจากวันที่บันทึกล่าสุดถึงวันนี้ — ใช้บอกว่าข้อมูลที่เห็นเป็นปัจจุบันแค่ไหน
function daysSince(isoDate: string) {
  const latest = new Date(`${isoDate}T00:00:00`);
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((todayMidnight.getTime() - latest.getTime()) / (24 * 60 * 60 * 1000));
}

export function TankGauge({
  label,
  liters,
  capacity,
  pct,
  averageDailyUsage,
  daysRemaining,
  etaDate,
  lowStockDays,
  safetyStock = 0,
  latestRecordDate = null,
}: {
  label: string;
  liters: number;
  capacity: number;
  pct: number;
  averageDailyUsage: number;
  daysRemaining: number | null;
  etaDate: string | null;
  lowStockDays: number;
  safetyStock?: number;
  latestRecordDate?: string | null;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const belowSafetyStock = safetyStock > 0 && liters < safetyStock;
  const safetyPct = capacity > 0 ? Math.max(0, Math.min(100, (safetyStock / capacity) * 100)) : 0;
  // สีตามสัดส่วนน้ำมันในถัง: มากกว่า 60% เขียว, มากกว่า 40% เหลือง, ต่ำกว่านั้นแดง
  // — แต่ถ้าคงเหลือต่ำกว่า safety stock ให้ถือเป็นวิกฤตทันทีไม่ว่าสัดส่วนเท่าไหร่
  const status = belowSafetyStock ? 'danger' : clamped > 60 ? 'ok' : clamped > 40 ? 'warn' : 'danger';
  const fillColor = { ok: '#15803D', warn: '#C69214', danger: '#B23A1B' }[status];
  const statusText = { ok: 'ปกติ', warn: 'เฝ้าระวัง', danger: 'วิกฤต' }[status];
  const statusClass = {
    ok: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-gold-50 text-gold-700',
    danger: 'bg-red-50 text-red-700',
  }[status];
  // จำนวนวันเหลือยังเตือนตามเกณฑ์วัน (คนละเรื่องกับสัดส่วนถัง — ถังเกือบเต็มแต่ใช้เร็วก็หมดไวได้)
  const daysCritical = daysRemaining !== null && daysRemaining < lowStockDays;
  const staleDays = latestRecordDate ? daysSince(latestRecordDate) : null;
  const isStale = staleDays !== null && staleDays >= 2;

  return (
    <div className="panel">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-extrabold leading-5 text-slate-950">{label}</div>
          <div className="mt-0.5 text-xs text-slate-500">ความจุ {Math.round(capacity).toLocaleString('th-TH')} ลิตร</div>
          {latestRecordDate && (
            <div className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${isStale ? 'text-amber-700' : 'text-slate-400'}`}>
              {isStale && <AlertCircle size={11} aria-hidden="true" />}
              ข้อมูลล่าสุด {formatThaiDate(latestRecordDate)}
              {staleDays === 0 ? ' (วันนี้)' : staleDays === 1 ? ' (เมื่อวาน)' : ` (${staleDays} วันที่แล้ว)`}
            </div>
          )}
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

      <div className="relative h-3 rounded-md bg-slate-100">
        <div
          className="h-full rounded-md transition-all duration-500"
          style={{ width: `${clamped}%`, background: fillColor }}
        />
        {safetyPct > 0 && (
          <div
            className="absolute -top-0.5 h-4 w-0.5 rounded bg-slate-700"
            style={{ left: `${safetyPct}%` }}
            title={`Safety Stock ${Math.round(safetyStock).toLocaleString('th-TH')} ลิตร`}
          />
        )}
      </div>
      {safetyStock > 0 && (
        <div className={`mt-1.5 text-[11px] font-semibold ${belowSafetyStock ? 'text-red-700' : 'text-slate-500'}`}>
          Safety Stock {Math.round(safetyStock).toLocaleString('th-TH')} ลิตร
          {belowSafetyStock && ' — คงเหลือต่ำกว่าเกณฑ์สำรอง!'}
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
        <div>
          <dt className="text-xs font-semibold text-slate-500">ใช้เฉลี่ย/วัน</dt>
          <dd className="mt-0.5 text-base font-extrabold tabular-nums text-slate-900">
            {Math.round(averageDailyUsage).toLocaleString('th-TH')} <span className="text-xs font-semibold text-slate-500">ลิตร</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate-500">{safetyStock > 0 ? 'ใช้ได้อีกก่อนถึง Safety Stock' : 'คาดว่าใช้ได้อีก'}</dt>
          <dd className={`mt-0.5 text-base font-extrabold tabular-nums ${daysCritical ? 'text-red-700' : 'text-slate-900'}`}>
            {daysRemaining === null ? '-' : daysRemaining.toLocaleString('th-TH', { maximumFractionDigits: 1 })} <span className="text-xs font-semibold text-slate-500">วัน</span>
          </dd>
          {etaDate && (
            <dd className="mt-0.5 text-xs font-semibold text-slate-500">
              {safetyStock > 0 ? 'คาดถึงจุดสำรองวันที่' : 'คาดหมดวันที่'} {formatThaiDate(etaDate)}
            </dd>
          )}
        </div>
      </dl>
      <p className="mt-2 text-[11px] leading-4 text-slate-500">
        {safetyStock > 0
          ? 'คำนวณจาก (คงเหลือ − Safety Stock) ÷ ยอดใช้เฉลี่ย 7 วันที่มีบันทึกล่าสุด'
          : 'คำนวณจากยอดคงเหลือ ÷ ยอดใช้เฉลี่ย 7 วันที่มีบันทึกล่าสุด'}
      </p>
    </div>
  );
}
