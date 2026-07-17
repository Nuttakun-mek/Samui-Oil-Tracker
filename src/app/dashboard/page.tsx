import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { STATION_IDS, type FuelRecord, type Station } from '@/lib/types/domain';
import { TankGauge } from '@/components/tank-gauge';
import { KpiCard } from '@/components/kpi-card';
import { InsightList } from '@/components/insight-list';
import { DashboardAnalytics } from '@/components/dashboard-analytics';
import { OperationsInsights } from '@/components/operations-insights';
import { getCurrentUserAccess, requirePageAccess } from '@/lib/auth/server';
import { estimatedFuelCost } from '@/lib/analytics/fuel';
import { computeStationInsights } from '@/lib/analytics/station-insight';
import { LowStockBanner } from '@/components/low-stock-banner';
import { ProcurementBalanceCard } from '@/components/procurement-balance-card';
import { getProcurementSummary } from '@/lib/procurement';
import Link from 'next/link';
import { DatabaseZap, FileUp } from 'lucide-react';

export const revalidate = 0; // always fetch fresh — ข้อมูลด้าน operational ต้องสดเสมอ

export default async function DashboardPage() {
  const role = await requirePageAccess('dashboard');

  const supabase = await createClient();
  const procurementSummary = await getProcurementSummary();

  // แดชบอร์ด (ภาพรวม) ให้ทุกบัญชีเห็นทุกพื้นที่โดยเจตนา — ต่างจาก history/reports/entry
  // ที่ยังจำกัดตามสิทธิ์สถานีของบัญชีตามปกติ จึงอ่านผ่าน admin client เพื่อข้าม RLS เฉพาะหน้านี้
  // (fallback กลับไปจำกัดตามสิทธิ์ถ้ายังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY กันหน้าแอปพัง)
  let stations: Station[] | null;
  let records: FuelRecord[] | null;
  try {
    const admin = createAdminClient();
    const [{ data: allStations }, { data: allRecords }] = await Promise.all([
      admin.from('stations').select('*').order('id'),
      admin.from('fuel_records').select('*').order('record_date', { ascending: true }).order('created_at', { ascending: true }),
    ]);
    stations = allStations;
    records = allRecords;
  } catch {
    const access = await getCurrentUserAccess();
    const [{ data: scopedStations }, { data: scopedRecords }] = await Promise.all([
      supabase.from('stations').select('*').in('id', access.stationIds).order('id'),
      supabase.from('fuel_records').select('*').in('station_id', access.stationIds).order('record_date', { ascending: true }).order('created_at', { ascending: true }),
    ]);
    stations = scopedStations;
    records = scopedRecords;
  }

  const stationOrder = new Map(STATION_IDS.map((id, index) => [id, index]));
  const stationList = ((stations ?? []) as Station[])
    .sort((a, b) => (stationOrder.get(a.id) ?? 99) - (stationOrder.get(b.id) ?? 99));
  const recordList = (records ?? []) as FuelRecord[];
  const stationInsights = computeStationInsights(stationList, recordList);
  const latestRecordDate = recordList.length ? recordList[recordList.length - 1].record_date : null;
  const recentStartDate = latestRecordDate
    ? new Date(new Date(`${latestRecordDate}T00:00:00`).getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;

  const byStation = (id: string) => recordList.filter((r) => r.station_id === id);
  const latest = (id: string) => {
    const list = byStation(id);
    return list.length ? list[list.length - 1] : null;
  };
  const recentByStation = (id: string, days: number) => {
    const stationRecords = byStation(id);
    const latestDate = stationRecords.length ? stationRecords[stationRecords.length - 1].record_date : null;
    if (!latestDate) return [];
    const startDate = new Date(new Date(`${latestDate}T00:00:00`).getTime() - (days - 1) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return stationRecords.filter((record) => record.record_date >= startDate && record.record_date <= latestDate);
  };
  const sourceLabel = (source: FuelRecord['record_source']) => {
    if (source === 'database') return 'ฐานข้อมูลย้อนหลัง';
    if (source === 'upload') return 'อัปโหลดไฟล์';
    return 'กรอกโดยพนักงาน';
  };
  const stationSummaries = stationList.map((station) => {
    const stationRecords = byStation(station.id);
    const latestRecord = latest(station.id);
    const sourceCounts = stationRecords.reduce<Record<string, number>>((acc, record) => {
      acc[record.record_source] = (acc[record.record_source] ?? 0) + 1;
      return acc;
    }, {});

    return {
      station,
      records: stationRecords,
      latestRecord,
      firstDate: stationRecords[0]?.record_date ?? '-',
      lastDate: latestRecord?.record_date ?? '-',
      // ยอดสะสมตลอดช่วงข้อมูล (วันแรกที่มีข้อมูลตั้งต้น ถึงวันล่าสุด)
      receivedTotal: stationRecords.reduce((sum, record) => sum + record.received_liters, 0),
      dispatchedTotal: stationRecords.reduce((sum, record) => sum + record.dispatched_liters, 0),
      received30: recentByStation(station.id, 30).reduce((sum, record) => sum + record.received_liters, 0),
      dispatched30: recentByStation(station.id, 30).reduce((sum, record) => sum + record.dispatched_liters, 0),
      sourceText: Object.entries(sourceCounts)
        .map(([source, count]) => `${sourceLabel(source as FuelRecord['record_source'])} ${count.toLocaleString('th-TH')}`)
        .join(' / '),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="page-kicker">Dashboard</div>
          <h1 className="page-title">ภาพรวมน้ำมัน</h1>
          <p className="page-subtitle">สถานะคงเหลือปัจจุบัน แนวโน้ม และสัญญาณเฝ้าระวังของทั้ง 3 พื้นที่เกาะ</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
          ข้อมูลจากฐาน {recordList.length.toLocaleString('th-TH')} record
          {latestRecordDate ? ` ล่าสุด ${latestRecordDate}` : ''}
        </div>
      </div>

      <ProcurementBalanceCard groups={procurementSummary.groups} isAdmin={role === 'admin'} />

      {recordList.length === 0 ? (
        <section className="panel flex min-h-72 flex-col items-center justify-center px-5 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <DatabaseZap size={25} aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-extrabold text-slate-950">ฐานข้อมูลพร้อมสำหรับข้อมูลชุดใหม่</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">
            ยังไม่มีบันทึกน้ำมัน กราฟและตัวชี้วัดจะเริ่มแสดงผลทันทีหลังบันทึกรายวันหรือนำเข้าไฟล์ข้อมูล
          </p>
          <div className="mt-5 flex w-full max-w-sm flex-col justify-center gap-2 sm:flex-row">
            <Link href="/entry" className="btn-primary w-full sm:w-auto">
              บันทึกข้อมูลรายวัน
            </Link>
            <Link href="/settings#spreadsheet-import" className="btn-secondary w-full sm:w-auto">
              <FileUp size={17} aria-hidden="true" />
              นำเข้าไฟล์
            </Link>
          </div>
        </section>
      ) : (
        <>
      <LowStockBanner insights={stationInsights} />

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-extrabold text-slate-950">สถานะน้ำมันรายพื้นที่</h2>
          <p className="text-sm text-slate-600">ยอดคงเหลือล่าสุด อัตราใช้ปกติ และจำนวนวันที่คาดว่าจะใช้งานได้ของแต่ละพื้นที่</p>
        </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stationInsights.map((insight) => {
          const st = insight.station;
          const pct = st.tank_capacity_liters > 0 ? (insight.closing / st.tank_capacity_liters) * 100 : 0;
          return (
            <TankGauge
              key={st.id}
              label={st.name}
              liters={insight.closing}
              capacity={st.tank_capacity_liters}
              pct={pct}
              averageDailyUsage={insight.averageDaily}
              daysRemaining={insight.daysRemaining}
              etaDate={insight.etaDate}
              lowStockDays={st.low_stock_days}
            />
          );
        })}
      </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="คงเหลือรวม 3 พื้นที่"
          value={recordList.length ? stationList.reduce((a, st) => a + (latest(st.id)?.closing_liters ?? 0), 0) : 0}
          unit="ลิตร"
        />
        <KpiCard
          label={`รับสะสม (${recentStartDate ?? '-'} ถึง ${latestRecordDate ?? '-'})`}
          value={stationList.reduce((a, st) => a + recentByStation(st.id, 30).reduce((x, r) => x + r.received_liters, 0), 0)}
          unit="ลิตร"
        />
        <KpiCard
          label={`ใช้น้ำมันสะสม (${recentStartDate ?? '-'} ถึง ${latestRecordDate ?? '-'})`}
          value={stationList.reduce((a, st) => a + recentByStation(st.id, 30).reduce((x, r) => x + r.dispatched_liters, 0), 0)}
          unit="ลิตร"
        />
        <KpiCard
          label="งบประมาณใช้จ่ายโดยประมาณ 30 วัน"
          value={estimatedFuelCost(stationList, stationList.flatMap((st) => recentByStation(st.id, 30)))}
          unit="บาท"
          decimals={2}
        />
      </div>

      <DashboardAnalytics stations={stationList} records={recordList} />

      <OperationsInsights stations={stationList} records={recordList} />

      <div className="panel">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="panel-title">ข้อมูลจริงจากฐานข้อมูล</h3>
            <p className="text-sm text-slate-500">สรุปตามพื้นที่จากตาราง fuel_records ที่ระบบใช้สร้างกราฟและ KPI</p>
          </div>
          <div className="text-xs font-semibold text-slate-500">
            {recordList.length ? `${recordList[0].record_date} ถึง ${latestRecordDate}` : 'ไม่มีข้อมูล'}
          </div>
        </div>
        <div className="table-shell">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-3 py-2 text-left">พื้นที่</th>
                <th className="px-3 py-2 text-right">Record</th>
                <th className="px-3 py-2 text-left">ช่วงข้อมูล</th>
                <th className="px-3 py-2 text-right">คงเหลือล่าสุด</th>
                <th className="px-3 py-2 text-right">รับสะสมทั้งหมด</th>
                <th className="px-3 py-2 text-right">ใช้สะสมทั้งหมด</th>
                <th className="px-3 py-2 text-right">รับ 30 วัน</th>
                <th className="px-3 py-2 text-right">ใช้ 30 วัน</th>
                <th className="px-3 py-2 text-left">แหล่งข้อมูล</th>
              </tr>
            </thead>
            <tbody>
              {stationSummaries.map((summary) => (
                <tr key={summary.station.id} className="border-t border-slate-200">
                  <td className="px-3 py-2 font-bold text-slate-900">{summary.station.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{summary.records.length.toLocaleString('th-TH')}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {summary.firstDate} ถึง {summary.lastDate}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Math.round(summary.latestRecord?.closing_liters ?? 0).toLocaleString('th-TH')}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-emerald-700">{Math.round(summary.receivedTotal).toLocaleString('th-TH')}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-amber-700">{Math.round(summary.dispatchedTotal).toLocaleString('th-TH')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Math.round(summary.received30).toLocaleString('th-TH')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Math.round(summary.dispatched30).toLocaleString('th-TH')}</td>
                  <td className="px-3 py-2 text-slate-600">{summary.sourceText || '-'}</td>
                </tr>
              ))}
              {stationSummaries.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    ยังไม่มีข้อมูลในฐานข้อมูล
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3 className="panel-title">ข้อความเตือนและข้อสังเกตอัตโนมัติ</h3>
        <InsightList stations={stationList} records={recordList} />
      </div>
        </>
      )}
    </div>
  );
}
