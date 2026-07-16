import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { STATION_LABEL } from '@/lib/types/domain';
import { formatThaiDate } from '@/lib/format/thai-date';
import type { StationInsight } from '@/lib/analytics/station-insight';

export function LowStockBanner({ insights }: { insights: StationInsight[] }) {
  const critical = insights.filter((item) => item.status === 'danger' && item.daysRemaining !== null);
  if (!critical.length) return null;

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-extrabold text-red-800">
            {critical.length} พื้นที่มีสต๊อกน้ำมันวิกฤต ต้องวางแผนจัดส่งด่วน
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-red-700">
            {critical.map((item) => (
              <li key={item.station.id}>
                <strong>{STATION_LABEL[item.station.id]}</strong> — เหลือใช้ได้อีก {item.daysRemaining?.toFixed(1)} วัน
                {item.etaDate && ` (คาดหมดวันที่ ${formatThaiDate(item.etaDate)})`}
              </li>
            ))}
          </ul>
          <Link href="/entry" className="mt-2 inline-block text-xs font-bold text-red-800 underline underline-offset-2 hover:text-red-900">
            ไปหน้าบันทึกข้อมูล / วางแผนจัดส่ง
          </Link>
        </div>
      </div>
    </div>
  );
}
