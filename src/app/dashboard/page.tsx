import { createClient } from '@/lib/supabase/server';
import { STATION_IDS, STATION_LABEL, type FuelRecord, type Station } from '@/lib/types/domain';
import { TankGauge } from '@/components/tank-gauge';
import { KpiCard } from '@/components/kpi-card';
import { TrendChart } from '@/components/trend-chart';
import { InsightList } from '@/components/insight-list';

export const revalidate = 0; // always fetch fresh — ข้อมูลด้าน operational ต้องสดเสมอ

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: stations }, { data: records }] = await Promise.all([
    supabase.from('stations').select('*').order('id'),
    supabase.from('fuel_records').select('*').order('record_date', { ascending: true }),
  ]);

  const stationList = (stations ?? []) as Station[];
  const recordList = (records ?? []) as FuelRecord[];

  const byStation = (id: string) => recordList.filter((r) => r.station_id === id);
  const latest = (id: string) => {
    const list = byStation(id);
    return list.length ? list[list.length - 1] : null;
  };
  const avgDispatch = (id: string, days: number) => {
    const list = byStation(id).slice(-days);
    if (!list.length) return 0;
    return list.reduce((a, r) => a + r.dispatched_liters, 0) / list.length;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-navy">ภาพรวมสต๊อกน้ำมัน</h1>
        <p className="text-sm text-muted mt-1">สถานะคงเหลือปัจจุบันและแนวโน้มการใช้น้ำมันของทั้ง 3 พื้นที่เกาะ</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stationList.map((st) => {
          const rec = latest(st.id);
          const cur = rec?.closing_liters ?? 0;
          const pct = st.tank_capacity_liters > 0 ? (cur / st.tank_capacity_liters) * 100 : 0;
          return <TankGauge key={st.id} label={st.name} liters={cur} capacity={st.tank_capacity_liters} pct={pct} />;
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="คงเหลือรวม 3 พื้นที่"
          value={recordList.length ? stationList.reduce((a, st) => a + (latest(st.id)?.closing_liters ?? 0), 0) : 0}
          unit="ลิตร"
        />
        <KpiCard
          label="รับสะสม (30 วันล่าสุด)"
          value={stationList.reduce((a, st) => a + byStation(st.id).slice(-30).reduce((x, r) => x + r.received_liters, 0), 0)}
          unit="ลิตร"
        />
        <KpiCard
          label="จ่ายสะสม (30 วันล่าสุด)"
          value={stationList.reduce((a, st) => a + byStation(st.id).slice(-30).reduce((x, r) => x + r.dispatched_liters, 0), 0)}
          unit="ลิตร"
        />
        <KpiCard
          label="พื้นที่วิกฤตสุด — เหลือใช้ได้อีก"
          value={Math.min(
            ...stationList.map((st) => {
              const rec = latest(st.id);
              const avg = avgDispatch(st.id, 7);
              return rec && avg > 0 ? rec.closing_liters / avg : Infinity;
            })
          )}
          unit="วัน"
          decimals={1}
          tone="danger"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="panel">
          <h3 className="panel-title">แนวโน้มน้ำมันคงเหลือรายวัน</h3>
          <TrendChart
            data={STATION_IDS.map((id) => ({
              id,
              label: STATION_LABEL[id],
              points: byStation(id).map((r) => ({ date: r.record_date, value: r.closing_liters })),
            }))}
          />
        </div>
        <div className="panel">
          <h3 className="panel-title">ข้อสังเกตอัตโนมัติ</h3>
          <InsightList stations={stationList} records={recordList} />
        </div>
      </div>
    </div>
  );
}
