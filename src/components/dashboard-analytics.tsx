'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { STATION_LABEL, type FuelRecord, type Station, type StationId } from '@/lib/types/domain';

type PeriodMode = 'daily' | 'monthly';
type RangeMode = 'all' | '30' | '90' | '180';
type StationFilter = 'all' | StationId;

function monthKey(date: string) {
  return date.slice(0, 7);
}

function rangeStart(latestDate: string | null, range: RangeMode) {
  if (!latestDate || range === 'all') return null;
  const days = Number(range);
  return new Date(new Date(`${latestDate}T00:00:00`).getTime() - (days - 1) * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString('th-TH');
}

export function DashboardAnalytics({ stations, records }: { stations: Station[]; records: FuelRecord[] }) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('monthly');
  const [stationFilter, setStationFilter] = useState<StationFilter>('all');
  const [rangeMode, setRangeMode] = useState<RangeMode>('all');

  const latestDate = records.length ? records[records.length - 1].record_date : null;
  const startDate = rangeStart(latestDate, rangeMode);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      if (stationFilter !== 'all' && record.station_id !== stationFilter) return false;
      if (startDate && record.record_date < startDate) return false;
      return true;
    });
  }, [records, startDate, stationFilter]);

  const chartData = useMemo(() => {
    const buckets = new Map<
      string,
      {
        period: string;
        received: number;
        dispatched: number;
        closingByStation: Partial<Record<StationId, { date: string; value: number }>>;
      }
    >();

    filteredRecords.forEach((record) => {
      const period = periodMode === 'monthly' ? monthKey(record.record_date) : record.record_date;
      const bucket = buckets.get(period) ?? {
        period,
        received: 0,
        dispatched: 0,
        closingByStation: {},
      };

      bucket.received += record.received_liters;
      bucket.dispatched += record.dispatched_liters;

      const currentClosing = bucket.closingByStation[record.station_id];
      if (!currentClosing || record.record_date >= currentClosing.date) {
        bucket.closingByStation[record.station_id] = {
          date: record.record_date,
          value: record.closing_liters,
        };
      }

      buckets.set(period, bucket);
    });

    return Array.from(buckets.values())
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((bucket) => ({
        period: bucket.period,
        received: bucket.received,
        dispatched: bucket.dispatched,
        closing: Object.values(bucket.closingByStation).reduce((sum, item) => sum + (item?.value ?? 0), 0),
      }));
  }, [filteredRecords, periodMode]);

  const totals = useMemo(
    () =>
      filteredRecords.reduce(
        (acc, record) => ({
          received: acc.received + record.received_liters,
          dispatched: acc.dispatched + record.dispatched_liters,
          latestClosing: acc.latestClosing,
        }),
        { received: 0, dispatched: 0, latestClosing: chartData.at(-1)?.closing ?? 0 }
      ),
    [chartData, filteredRecords]
  );

  const netChange = totals.received - totals.dispatched;
  const usageRatio = totals.received > 0 ? (totals.dispatched / totals.received) * 100 : 0;

  return (
    <div className="panel space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h3 className="panel-title">วิเคราะห์รับเข้า-ใช้ออก-คงเหลือ</h3>
          <p className="text-sm text-slate-500">
            แท่งสีเขียวคือรับเข้า แท่งสีส้มคือใช้ออก และเส้นสีน้ำเงินคือยอดคงเหลือปลายช่วง
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <select value={periodMode} onChange={(event) => setPeriodMode(event.target.value as PeriodMode)} className="field h-10">
            <option value="monthly">รายเดือน</option>
            <option value="daily">รายวัน</option>
          </select>
          <select value={stationFilter} onChange={(event) => setStationFilter(event.target.value as StationFilter)} className="field h-10">
            <option value="all">ทุกพื้นที่</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {STATION_LABEL[station.id]}
              </option>
            ))}
          </select>
          <select value={rangeMode} onChange={(event) => setRangeMode(event.target.value as RangeMode)} className="field h-10">
            <option value="all">ทั้งหมด</option>
            <option value="30">30 วันล่าสุด</option>
            <option value="90">90 วันล่าสุด</option>
            <option value="180">180 วันล่าสุด</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="text-xs font-bold text-emerald-700">รับเข้ารวม</div>
          <div className="text-xl font-extrabold text-emerald-900 tabular-nums">{formatNumber(totals.received)}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="text-xs font-bold text-amber-700">ใช้ออกรวม</div>
          <div className="text-xl font-extrabold text-amber-900 tabular-nums">{formatNumber(totals.dispatched)}</div>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
          <div className="text-xs font-bold text-sky-700">คงเหลือล่าสุด</div>
          <div className="text-xl font-extrabold text-sky-900 tabular-nums">{formatNumber(totals.latestClosing)}</div>
        </div>
        <div className={`rounded-lg border px-3 py-2 ${netChange >= 0 ? 'border-teal-200 bg-teal-50' : 'border-red-200 bg-red-50'}`}>
          <div className={`text-xs font-bold ${netChange >= 0 ? 'text-teal-700' : 'text-red-700'}`}>สมดุลรับ-ใช้</div>
          <div className={`text-xl font-extrabold tabular-nums ${netChange >= 0 ? 'text-teal-900' : 'text-red-900'}`}>
            {formatNumber(netChange)}
          </div>
        </div>
      </div>

      <div className="h-[360px] w-full">
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
            <CartesianGrid stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#64748B' }} minTickGap={periodMode === 'daily' ? 28 : 12} />
            <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickFormatter={(value) => Number(value).toLocaleString('th-TH')} width={72} />
            <Tooltip
              formatter={(value: number, name) => [`${Number(value).toLocaleString('th-TH')} ลิตร`, name]}
              labelFormatter={(label) => `ช่วง ${label}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="received" name="รับเข้า" fill="#059669" radius={[3, 3, 0, 0]} />
            <Bar dataKey="dispatched" name="ใช้ออก" fill="#D97706" radius={[3, 3, 0, 0]} />
            <Line type="monotone" dataKey="closing" name="คงเหลือ" stroke="#2563EB" strokeWidth={3} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        อัตราใช้ออกเทียบรับเข้า {usageRatio.toFixed(1)}% จากข้อมูล {filteredRecords.length.toLocaleString('th-TH')} record
      </div>
    </div>
  );
}
