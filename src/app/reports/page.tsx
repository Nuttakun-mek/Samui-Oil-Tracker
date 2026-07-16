import { FileText } from 'lucide-react';
import { getCurrentUserAccess, requirePageAccess } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import { formatThaiDate } from '@/lib/format/thai-date';
import { STATION_LABEL, type FuelRecord, type Station, type StationId } from '@/lib/types/domain';
import { estimatedFuelCost } from '@/lib/analytics/fuel';
import { ReportFilter } from './report-filter';

export const revalidate = 0;

function asDate(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function number(value: number) {
  return Math.round(value).toLocaleString('th-TH');
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAccess('reports');
  const access = await getCurrentUserAccess();
  const supabase = await createClient();
  const params = await searchParams;

  const { data: latest } = await supabase
    .from('fuel_records')
    .select('record_date')
    .in('station_id', access.stationIds)
    .order('record_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestDate = latest?.record_date ?? new Date().toISOString().slice(0, 10);
  const defaultFrom = `${latestDate.slice(0, 7)}-01`;
  const from = asDate(params.from) ?? defaultFrom;
  const to = asDate(params.to) ?? latestDate;
  const requestedStation = Array.isArray(params.station) ? params.station[0] : params.station;
  const selectedStation = requestedStation && access.stationIds.includes(requestedStation as StationId) ? requestedStation : 'all';
  const selectedStationIds = selectedStation === 'all' ? access.stationIds : [selectedStation];

  const [{ data: stations }, { data: records }] = await Promise.all([
    supabase.from('stations').select('*').in('id', access.stationIds).order('name'),
    supabase
      .from('fuel_records')
      .select('*')
      .in('station_id', selectedStationIds)
      .gte('record_date', from)
      .lte('record_date', to)
      .order('record_date')
      .order('station_id'),
  ]);

  const stationList = (stations ?? []) as Station[];
  const recordList = (records ?? []) as FuelRecord[];
  const received = recordList.reduce((sum, record) => sum + record.received_liters, 0);
  const dispatched = recordList.reduce((sum, record) => sum + record.dispatched_liters, 0);
  const budget = estimatedFuelCost(stationList, recordList);
  const priceByStation = new Map(stationList.map((station) => [station.id, station.fuel_price_per_liter]));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="page-kicker">Reports</div>
          <h1 className="page-title">รายงานน้ำมันรายวันทุกพื้นที่</h1>
          <p className="page-subtitle">{formatThaiDate(from)} ถึง {formatThaiDate(to)}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <FileText size={23} aria-hidden="true" />
        </div>
      </div>

      <ReportFilter initialFrom={from} initialTo={to} initialStation={selectedStation} stations={stationList} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="border-l-4 border-slate-900 pl-3">
          <div className="text-xs font-bold text-slate-500">จำนวนบันทึก</div>
          <div className="text-xl font-extrabold text-slate-950">{recordList.length.toLocaleString('th-TH')} รายการ</div>
        </div>
        <div className="border-l-4 border-emerald-600 pl-3">
          <div className="text-xs font-bold text-slate-500">รับเข้ารวม</div>
          <div className="text-xl font-extrabold text-slate-950">{number(received)} ลิตร</div>
        </div>
        <div className="border-l-4 border-amber-600 pl-3">
          <div className="text-xs font-bold text-slate-500">จ่ายออกรวม</div>
          <div className="text-xl font-extrabold text-slate-950">{number(dispatched)} ลิตร</div>
        </div>
        <div className="section-heading">
          <div className="text-xs font-bold text-slate-500">งบประมาณโดยประมาณ</div>
          <div className="text-xl font-extrabold text-slate-950">{budget.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</div>
        </div>
      </section>

      <div className="table-shell">
        <table className="w-full min-w-[1380px] text-sm">
          <thead>
            <tr className="table-header">
              <th className="px-3 py-2 text-left">วันที่</th>
              <th className="px-3 py-2 text-left">พื้นที่</th>
              <th className="px-3 py-2 text-right">ยกมา</th>
              <th className="px-3 py-2 text-right">รับเข้า</th>
              <th className="px-3 py-2 text-right">พร้อมใช้</th>
              <th className="px-3 py-2 text-right">จ่ายออก</th>
              <th className="px-3 py-2 text-right">คงเหลือ</th>
              <th className="px-3 py-2 text-right">ประมาณการค่าใช้จ่าย</th>
              <th className="px-3 py-2 text-left">ผู้รายงาน</th>
              <th className="px-3 py-2 text-left">แหล่งข้อมูล</th>
            </tr>
          </thead>
          <tbody>
            {recordList.slice(0, 200).map((record) => (
              <tr key={record.id} className="border-t border-slate-200">
                <td className="whitespace-nowrap px-3 py-2">{formatThaiDate(record.record_date)}</td>
                <td className="px-3 py-2 font-semibold">{STATION_LABEL[record.station_id]}</td>
                <td className="px-3 py-2 text-right tabular-nums">{number(record.opening_liters)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{number(record.received_liters)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{number(record.opening_liters + record.received_liters)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{number(record.dispatched_liters)}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">{number(record.closing_liters)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {(record.dispatched_liters * (priceByStation.get(record.station_id) ?? 0)).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท
                </td>
                <td className="px-3 py-2">{record.employee_code || '-'}</td>
                <td className="px-3 py-2">{record.record_source === 'database' ? 'ฐานข้อมูลย้อนหลัง' : record.record_source === 'upload' ? 'อัปโหลดไฟล์' : 'พนักงานกรอก'}</td>
              </tr>
            ))}
            {!recordList.length && (
              <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-500">ไม่พบข้อมูลในช่วงวันที่ที่เลือก</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {recordList.length > 200 && <p className="text-xs text-slate-500">หน้าจอแสดง 200 รายการแรก ส่วน PDF แสดงข้อมูลครบทั้งหมด</p>}
    </div>
  );
}
