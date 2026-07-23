import { FileText } from 'lucide-react';
import { getCurrentUserAccess, requirePageAccess } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatThaiDate } from '@/lib/format/thai-date';
import { STATION_IDS, STATION_LABEL, type FuelRecord, type Station, type StationId } from '@/lib/types/domain';
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

function recordSourceLabel(source: FuelRecord['record_source']) {
  if (source === 'database') return 'ฐานข้อมูลย้อนหลัง';
  if (source === 'upload') return 'อัปโหลดไฟล์';
  return 'พนักงานกรอก';
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAccess('reports');
  const params = await searchParams;

  // รายงาน (ภาพรวม) ให้ทุกบัญชีเห็นทุกพื้นที่โดยเจตนา เช่นเดียวกับหน้าแดชบอร์ด —
  // อ่านผ่าน admin client เพื่อข้าม RLS เฉพาะหน้านี้ (fallback ตามสิทธิ์ถ้าไม่มี service key)
  let supabase: ReturnType<typeof createAdminClient> | Awaited<ReturnType<typeof createClient>>;
  let visibleStationIds: StationId[];
  try {
    supabase = createAdminClient();
    visibleStationIds = [...STATION_IDS];
  } catch {
    const access = await getCurrentUserAccess();
    supabase = await createClient();
    visibleStationIds = access.stationIds;
  }

  const { data: latest } = await supabase
    .from('fuel_records')
    .select('record_date')
    .in('station_id', visibleStationIds)
    .order('record_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestDate = latest?.record_date ?? new Date().toISOString().slice(0, 10);
  const defaultFrom = `${latestDate.slice(0, 7)}-01`;
  const from = asDate(params.from) ?? defaultFrom;
  const to = asDate(params.to) ?? latestDate;
  // station รับได้ทั้ง 'all', พื้นที่เดียว, หรือหลายพื้นที่คั่นด้วยจุลภาค (เช่น 'samui,koh_tao') — ให้เลือก 1 / 2 / ทั้งหมดได้
  const requestedStationParam = Array.isArray(params.station) ? params.station[0] : params.station;
  const requestedStationIds =
    requestedStationParam && requestedStationParam !== 'all'
      ? requestedStationParam.split(',').filter((id): id is StationId => visibleStationIds.includes(id as StationId))
      : [];
  const selectedStationIds = requestedStationIds.length ? requestedStationIds : visibleStationIds;
  const selectedStation = requestedStationParam ?? 'all';

  const [{ data: stations }, { data: records }] = await Promise.all([
    supabase.from('stations').select('*').in('id', selectedStationIds).order('name'),
    supabase
      .from('fuel_records')
      .select('*')
      .in('station_id', selectedStationIds)
      .gte('record_date', from)
      .lte('record_date', to)
      .order('record_date')
      .order('created_at')
      .order('station_id'),
  ]);

  const stationList = ((stations ?? []) as Station[]).sort((a, b) => STATION_IDS.indexOf(a.id) - STATION_IDS.indexOf(b.id));
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

      <div className="flex flex-col gap-1 border-l-4 border-brand-600 bg-brand-50 px-4 py-3 text-sm text-brand-950 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-bold">
          {selectedStationIds.length === STATION_IDS.length
            ? 'มุมมองรวมทั้ง 3 พื้นที่'
            : selectedStationIds.map((id) => STATION_LABEL[id]).join(' + ')}
        </span>
        <span className="text-xs leading-5 text-brand-700">PDF หน้าแรกเป็นสรุปรวม และแต่ละพื้นที่เริ่มในหน้าใหม่</span>
      </div>

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

      <div className="space-y-8">
        {stationList.map((station) => {
          const stationRecords = recordList.filter((record) => record.station_id === station.id);
          const stationReceived = stationRecords.reduce((sum, record) => sum + record.received_liters, 0);
          const stationDispatched = stationRecords.reduce((sum, record) => sum + record.dispatched_liters, 0);
          const latestClosing = stationRecords.at(-1)?.closing_liters;
          return (
            <section key={station.id} aria-labelledby={`station-report-${station.id}`}>
              <div className="mb-3 flex flex-col gap-3 border-b border-slate-200 pb-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wide text-gold-700">รายงานพื้นที่</p>
                  <h2 id={`station-report-${station.id}`} className="mt-0.5 text-lg font-extrabold leading-7 text-brand-950">{STATION_LABEL[station.id]}</h2>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  <div><span className="block text-xs text-slate-500">รายการ</span><strong>{stationRecords.length.toLocaleString('th-TH')}</strong></div>
                  <div><span className="block text-xs text-slate-500">รับเข้า</span><strong className="text-emerald-700">{number(stationReceived)}</strong></div>
                  <div><span className="block text-xs text-slate-500">จ่ายออก</span><strong className="text-amber-700">{number(stationDispatched)}</strong></div>
                  <div><span className="block text-xs text-slate-500">คงเหลือล่าสุด</span><strong>{latestClosing === undefined ? '-' : number(latestClosing)}</strong></div>
                </div>
              </div>

              <div className="table-shell">
                <table className="w-full min-w-[1120px] text-sm">
                  <thead>
                    <tr className="table-header">
                      <th className="px-3 py-2 text-left">วันที่</th>
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
                    {stationRecords.map((record) => (
                      <tr key={record.id} className="border-t border-slate-200 even:bg-slate-50/60">
                        <td className="whitespace-nowrap px-3 py-2">{formatThaiDate(record.record_date)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{number(record.opening_liters)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{number(record.received_liters)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{number(record.opening_liters + record.received_liters)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{number(record.dispatched_liters)}</td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums">{number(record.closing_liters)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {(record.dispatched_liters * (priceByStation.get(record.station_id) ?? 0)).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท
                        </td>
                        <td className="px-3 py-2">{record.employee_code || '-'}</td>
                        <td className="px-3 py-2">{recordSourceLabel(record.record_source)}</td>
                      </tr>
                    ))}
                    {!stationRecords.length && (
                      <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-500">ไม่พบข้อมูลของพื้นที่นี้ในช่วงวันที่ที่เลือก</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
