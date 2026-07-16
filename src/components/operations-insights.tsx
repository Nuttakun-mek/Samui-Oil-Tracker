'use client';

import { useState } from 'react';
import { CalendarCheck, ChevronDown, ChevronUp, Gauge, Target, TrendingUp } from 'lucide-react';
import { formatThaiDate, formatThaiMonth } from '@/lib/format/thai-date';
import { STATION_LABEL, type FuelRecord, type Station } from '@/lib/types/domain';
import { findAnomalies } from '@/lib/analytics/station-insight';

const DAY_MS = 24 * 60 * 60 * 1000;

function daySpan(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / DAY_MS) + 1;
}

export function OperationsInsights({ stations, records }: { stations: Station[]; records: FuelRecord[] }) {
  const [showAnomalies, setShowAnomalies] = useState(false);

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

  const anomalies = findAnomalies(stations, records);

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

        <button
          type="button"
          onClick={() => setShowAnomalies((current) => !current)}
          disabled={anomalies.length === 0}
          aria-expanded={showAnomalies}
          className="rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 disabled:cursor-default disabled:hover:border-slate-200"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md text-slate-700 bg-slate-100">
              <Gauge size={18} aria-hidden="true" />
            </div>
            {anomalies.length > 0 && (showAnomalies ? <ChevronUp size={16} className="mt-1 text-slate-400" /> : <ChevronDown size={16} className="mt-1 text-slate-400" />)}
          </div>
          <div className="mt-3 text-xs font-bold text-slate-600">วันที่ใช้สูงกว่าค่าเฉลี่ย 2 เท่า</div>
          <div className="mt-1 text-xl font-extrabold text-slate-950 tabular-nums">{anomalies.length.toLocaleString('th-TH')}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{anomalies.length ? 'คลิกเพื่อดูรายการ' : 'ไม่พบความผิดปกติในช่วงนี้'}</div>
        </button>
      </div>

      {showAnomalies && anomalies.length > 0 && (
        <div className="table-shell">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-3 py-2 text-left">วันที่</th>
                <th className="px-3 py-2 text-left">พื้นที่</th>
                <th className="px-3 py-2 text-right">ใช้จริง</th>
                <th className="px-3 py-2 text-right">ค่าเฉลี่ย</th>
                <th className="px-3 py-2 text-right">เกินค่าเฉลี่ย</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.slice(0, 50).map(({ record, average, ratio }) => (
                <tr key={record.id} className="border-t border-slate-200">
                  <td className="whitespace-nowrap px-3 py-2">{formatThaiDate(record.record_date)}</td>
                  <td className="px-3 py-2 font-semibold">{STATION_LABEL[record.station_id]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Math.round(record.dispatched_liters).toLocaleString('th-TH')}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{Math.round(average).toLocaleString('th-TH')}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-red-700">{ratio.toFixed(1)}×</td>
                </tr>
              ))}
            </tbody>
          </table>
          {anomalies.length > 50 && (
            <p className="px-3 py-2 text-xs text-slate-500">แสดง 50 รายการแรกจากทั้งหมด {anomalies.length.toLocaleString('th-TH')} รายการ</p>
          )}
        </div>
      )}
    </section>
  );
}
