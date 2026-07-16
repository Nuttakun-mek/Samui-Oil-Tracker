import { CalendarCheck, Gauge, Target, TrendingUp } from 'lucide-react';
import { formatThaiMonth } from '@/lib/format/thai-date';
import { type FuelRecord, type Station } from '@/lib/types/domain';

const DAY_MS = 24 * 60 * 60 * 1000;

function daySpan(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / DAY_MS) + 1;
}

export function OperationsInsights({ stations, records }: { stations: Station[]; records: FuelRecord[] }) {
  const expectedDays = stations.reduce((sum, station) => {
    const stationRecords = records.filter((record) => record.station_id === station.id);
    return stationRecords.length ? sum + daySpan(stationRecords[0].record_date, stationRecords.at(-1)!.record_date) : sum;
  }, 0);
  const completeness = expectedDays ? (records.length / expectedDays) * 100 : 0;

  const plannedRecords = records.filter((record) => record.plan_received_liters > 0);
  const planned = plannedRecords.reduce((sum, record) => sum + record.plan_received_liters, 0);
  const actualForPlan = plannedRecords.reduce((sum, record) => sum + record.received_liters, 0);
  const planAchievement = planned ? (actualForPlan / planned) * 100 : 0;

  const usageByMonth = records.reduce<Map<string, number>>((months, record) => {
    const key = record.record_date.slice(0, 7);
    months.set(key, (months.get(key) ?? 0) + record.dispatched_liters);
    return months;
  }, new Map());
  const peakMonth = [...usageByMonth.entries()].sort((a, b) => b[1] - a[1])[0];

  const stationAverages = new Map(
    stations.map((station) => {
      const stationRecords = records.filter((record) => record.station_id === station.id);
      const average = stationRecords.length
        ? stationRecords.reduce((sum, record) => sum + record.dispatched_liters, 0) / stationRecords.length
        : 0;
      return [station.id, average] as const;
    })
  );
  const unusualDays = records.filter((record) => {
    const average = stationAverages.get(record.station_id) ?? 0;
    return average > 0 && record.dispatched_liters > average * 2;
  }).length;

  const insights = [
    {
      label: 'ความครบถ้วนของวันบันทึก',
      value: `${completeness.toFixed(1)}%`,
      detail: `${records.length.toLocaleString('th-TH')} จาก ${expectedDays.toLocaleString('th-TH')} วัน-พื้นที่`,
      icon: CalendarCheck,
      tone: 'text-brand-700 bg-brand-50',
    },
    {
      label: 'รับจริงเทียบแผน',
      value: planned ? `${planAchievement.toFixed(1)}%` : '-',
      detail: planned ? `แผน ${Math.round(planned).toLocaleString('th-TH')} ลิตร` : 'ยังไม่มีรายการที่ระบุแผนรับ',
      icon: Target,
      tone: 'text-brand-700 bg-brand-50',
    },
    {
      label: 'เดือนที่ใช้น้ำมันสูงสุด',
      value: peakMonth ? formatThaiMonth(peakMonth[0]) : '-',
      detail: peakMonth ? `${Math.round(peakMonth[1]).toLocaleString('th-TH')} ลิตร` : 'ยังไม่มีข้อมูล',
      icon: TrendingUp,
      tone: 'text-gold-700 bg-gold-50',
    },
    {
      label: 'วันที่ใช้สูงกว่าค่าเฉลี่ย 2 เท่า',
      value: unusualDays.toLocaleString('th-TH'),
      detail: 'ใช้เป็นรายการสำหรับตรวจสอบความผิดปกติ',
      icon: Gauge,
      tone: 'text-slate-700 bg-slate-100',
    },
  ];

  return (
    <section className="space-y-3">
      <div>
        <h2 className="panel-title">อินไซด์เพื่อควบคุมการปฏิบัติงาน</h2>
        <p className="text-sm text-slate-500">ตรวจความครบถ้วน ประสิทธิผลของแผน และรายการที่ควรทวนสอบจากข้อมูลจริง</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {insights.map(({ label, value, detail, icon: Icon, tone }) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className={`flex h-9 w-9 items-center justify-center rounded-md ${tone}`}>
              <Icon size={18} aria-hidden="true" />
            </div>
            <div className="mt-3 text-xs font-bold text-slate-600">{label}</div>
            <div className="mt-1 text-xl font-extrabold text-slate-950 tabular-nums">{value}</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
