import Link from 'next/link';
import { AlertTriangle, Fuel } from 'lucide-react';
import type { ProcurementGroupSummary } from '@/lib/procurement';

function formatLiters(value: number) {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

function GroupCard({ group, isAdmin }: { group: ProcurementGroupSummary; isAdmin: boolean }) {
  if (!group.baseline) {
    return (
      <div className="panel border-l-4 border-l-slate-300">
        <div className="mb-1.5 text-xs font-bold text-slate-500">{group.label}</div>
        <p className="text-sm text-slate-500">{group.detail}</p>
        <p className="mt-2 text-sm font-semibold text-amber-700">ยังไม่ได้ตั้งยอดคงเหลือเริ่มต้น</p>
        {isAdmin && (
          <Link href="/settings?tab=procurement" className="mt-2 inline-block text-xs font-bold text-brand-700 underline underline-offset-2">
            ไปตั้งค่าที่ Settings → จัดซื้อล๊อตใหญ่
          </Link>
        )}
      </div>
    );
  }

  const tone = group.isLow ? 'border-l-red-600' : 'border-l-brand-700';
  const valueTone = group.isLow ? 'text-red-700' : 'text-slate-950';

  return (
    <div className={`panel border-l-4 ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-slate-500">{group.label}</div>
          <p className="text-xs text-slate-500">{group.detail}</p>
        </div>
        {group.isLow && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
            <AlertTriangle size={12} aria-hidden="true" />
            ใกล้หมดล๊อต
          </span>
        )}
      </div>
      <div className={`mt-1.5 text-2xl font-extrabold tabular-nums ${valueTone}`}>
        {formatLiters(group.balance ?? 0)} <small className="text-sm font-semibold text-slate-500">ลิตรคงเหลือ</small>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>ยอดเริ่มต้น {formatLiters(group.baseline.liters)} ลิตร ({group.baseline.date})</span>
        <span className="text-emerald-700">+ เติมล๊อต {group.contractsCount.toLocaleString('th-TH')} ครั้ง รวม {formatLiters(group.contractsSum)} ลิตร</span>
        <span className="text-amber-700">− รับเข้าแล้ว {formatLiters(group.receivedSum)} ลิตร</span>
      </div>
      {isAdmin && (
        <Link href="/settings?tab=procurement" className="mt-2 inline-block text-xs font-bold text-brand-700 underline underline-offset-2">
          จัดการล๊อตใหญ่
        </Link>
      )}
    </div>
  );
}

export function ProcurementBalanceCard({ groups, isAdmin }: { groups: ProcurementGroupSummary[]; isAdmin: boolean }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Fuel size={18} className="text-brand-700" aria-hidden="true" />
        <h2 className="text-lg font-extrabold text-slate-950">คงเหลือจากสัญญาซื้อล๊อตใหญ่</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <GroupCard key={group.id} group={group} isAdmin={isAdmin} />
        ))}
      </div>
    </section>
  );
}
