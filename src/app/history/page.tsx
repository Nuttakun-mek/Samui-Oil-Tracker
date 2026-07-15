import { createClient } from '@/lib/supabase/server';
import { STATION_IDS, STATION_LABEL, type FuelRecord } from '@/lib/types/domain';
import Link from 'next/link';
import { DeleteButton } from './delete-button';

export const revalidate = 0;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  const supabase = await createClient();
  const { station: stationFilter } = await searchParams;

  let query = supabase.from('fuel_records').select('*').order('record_date', { ascending: false });
  if (stationFilter) query = query.eq('station_id', stationFilter);

  const { data } = await query;
  const records = (data ?? []) as FuelRecord[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-navy">ประวัติข้อมูลทั้งหมด</h1>
        <p className="text-sm text-muted mt-1">ค้นหาและกรองข้อมูลรับ–จ่ายน้ำมันย้อนหลัง</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link href="/history" className={`chip ${!stationFilter ? 'chip-active' : ''}`}>
          ทั้งหมด
        </Link>
        {STATION_IDS.map((id) => (
          <Link key={id} href={`/history?station=${id}`} className={`chip ${stationFilter === id ? 'chip-active' : ''}`}>
            {STATION_LABEL[id]}
          </Link>
        ))}
      </div>

      <div className="panel !p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy text-white text-xs uppercase">
              <th className="text-left px-3.5 py-2.5">วันที่</th>
              <th className="text-left px-3.5 py-2.5">พื้นที่</th>
              <th className="text-right px-3.5 py-2.5">ยกมา</th>
              <th className="text-right px-3.5 py-2.5">รับ</th>
              <th className="text-right px-3.5 py-2.5">จ่าย</th>
              <th className="text-right px-3.5 py-2.5">คงเหลือ</th>
              <th className="text-left px-3.5 py-2.5">หมายเหตุ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-10 text-muted">
                  ไม่พบข้อมูล
                </td>
              </tr>
            )}
            {records.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-teal-50">
                <td className="px-3.5 py-2.5 tabular-nums whitespace-nowrap">{r.record_date}</td>
                <td className="px-3.5 py-2.5 whitespace-nowrap">{STATION_LABEL[r.station_id]}</td>
                <td className="px-3.5 py-2.5 text-right tabular-nums">{Math.round(r.opening_liters).toLocaleString('th-TH')}</td>
                <td className="px-3.5 py-2.5 text-right tabular-nums">{Math.round(r.received_liters).toLocaleString('th-TH')}</td>
                <td className="px-3.5 py-2.5 text-right tabular-nums">{Math.round(r.dispatched_liters).toLocaleString('th-TH')}</td>
                <td className="px-3.5 py-2.5 text-right tabular-nums">{Math.round(r.closing_liters).toLocaleString('th-TH')}</td>
                <td className="px-3.5 py-2.5">{r.note || '-'}</td>
                <td className="px-3.5 py-2.5">
                  <DeleteButton id={r.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
