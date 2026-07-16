import type { FuelRecord, Station, StationId } from '@/lib/types/domain';
import { formatThaiDateShort, formatThaiMonth } from '@/lib/format/thai-date';
import { estimatedFuelCost } from './fuel';

export type StationStatus = 'ok' | 'warn' | 'danger';
export type PeriodMode = 'daily' | 'monthly';

export interface StationInsight {
  station: Station;
  records: FuelRecord[];
  received: number;
  dispatched: number;
  closing: number;
  averageDaily: number;
  daysRemaining: number | null;
  etaDate: string | null;
  trendPct: number | null;
  peak: FuelRecord | null;
  status: StationStatus;
  activeDays: number;
  share: number;
  budget: number;
}

function addDaysIso(isoDate: string, days: number) {
  return new Date(new Date(`${isoDate}T00:00:00`).getTime() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

// เกณฑ์สถานะเดียวกับที่ dashboard และ PDF ใช้ — ห้ามคำนวณซ้ำที่อื่น
export function computeStationInsight(
  station: Station,
  records: FuelRecord[],
  totalDispatchedForShare = 0
): StationInsight {
  const stationRecords = records.filter((record) => record.station_id === station.id);
  const received = stationRecords.reduce((sum, record) => sum + record.received_liters, 0);
  const dispatched = stationRecords.reduce((sum, record) => sum + record.dispatched_liters, 0);
  const activeDays = new Set(stationRecords.map((record) => record.record_date)).size;
  const latest = stationRecords.at(-1) ?? null;
  const latestSeven = stationRecords.slice(-7);
  const previousSeven = stationRecords.slice(-14, -7);
  const recentUsage = latestSeven.reduce((sum, record) => sum + record.dispatched_liters, 0);
  const previousUsage = previousSeven.reduce((sum, record) => sum + record.dispatched_liters, 0);
  const averageDaily = latestSeven.length ? recentUsage / latestSeven.length : 0;
  const daysRemaining = averageDaily > 0 && latest ? latest.closing_liters / averageDaily : null;
  const etaDate = daysRemaining !== null && latest ? addDaysIso(latest.record_date, Math.floor(daysRemaining)) : null;
  const trendPct = previousUsage > 0 ? ((recentUsage - previousUsage) / previousUsage) * 100 : null;
  const peak = stationRecords.reduce<FuelRecord | null>(
    (highest, record) => (!highest || record.dispatched_liters > highest.dispatched_liters ? record : highest),
    null
  );
  const status: StationStatus =
    daysRemaining !== null && daysRemaining < station.low_stock_days
      ? 'danger'
      : daysRemaining !== null && daysRemaining < station.low_stock_days * 1.5
        ? 'warn'
        : 'ok';

  return {
    station,
    records: stationRecords,
    received,
    dispatched,
    closing: latest?.closing_liters ?? 0,
    averageDaily,
    daysRemaining,
    etaDate,
    trendPct,
    peak,
    status,
    activeDays,
    share: totalDispatchedForShare > 0 ? (dispatched / totalDispatchedForShare) * 100 : 0,
    budget: estimatedFuelCost([station], stationRecords),
  };
}

export function computeStationInsights(stations: Station[], records: FuelRecord[]) {
  const totalDispatched = records.reduce((sum, record) => sum + record.dispatched_liters, 0);
  return stations.map((station) => computeStationInsight(station, records, totalDispatched));
}

export interface TrendBucket {
  period: string;
  periodLabel: string;
  received: number;
  dispatched: number;
  closing: number;
}

// เกณฑ์เดียวที่ใช้ตัดสินว่ากราฟแนวโน้มควรแสดงรายวันหรือรายเดือน — ใช้ร่วมกันทั้ง dashboard และ PDF
// เพื่อไม่ให้ช่วงวันที่ที่เลือกไว้แคบ (เช่น 7 วัน) ถูกยุบรวมเป็นแท่งเดียวรายเดือนจนดูไม่มีข้อมูล
export function suggestPeriodMode(from: string, to: string, maxDailySpanDays = 45): PeriodMode {
  if (!from || !to) return 'daily';
  const dayMs = 24 * 60 * 60 * 1000;
  const spanDays = Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / dayMs) + 1;
  return spanDays > 0 && spanDays <= maxDailySpanDays ? 'daily' : 'monthly';
}

export function buildTrendBuckets(records: FuelRecord[], periodMode: PeriodMode): TrendBucket[] {
  const buckets = new Map<
    string,
    {
      period: string;
      received: number;
      dispatched: number;
      closingByStation: Partial<Record<StationId, { date: string; value: number }>>;
    }
  >();

  records.forEach((record) => {
    const period = periodMode === 'monthly' ? record.record_date.slice(0, 7) : record.record_date;
    const bucket = buckets.get(period) ?? { period, received: 0, dispatched: 0, closingByStation: {} };
    bucket.received += record.received_liters;
    bucket.dispatched += record.dispatched_liters;
    const currentClosing = bucket.closingByStation[record.station_id];
    if (!currentClosing || record.record_date >= currentClosing.date) {
      bucket.closingByStation[record.station_id] = { date: record.record_date, value: record.closing_liters };
    }
    buckets.set(period, bucket);
  });

  return Array.from(buckets.values())
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((bucket) => ({
      period: bucket.period,
      periodLabel: periodMode === 'monthly' ? formatThaiMonth(bucket.period) : formatThaiDateShort(bucket.period),
      received: bucket.received,
      dispatched: bucket.dispatched,
      closing: Object.values(bucket.closingByStation).reduce((sum, item) => sum + (item?.value ?? 0), 0),
    }));
}

export interface Anomaly {
  record: FuelRecord;
  average: number;
  ratio: number;
}

export function findAnomalies(stations: Station[], records: FuelRecord[], multiplier = 2): Anomaly[] {
  const stationAverages = new Map(
    stations.map((station) => {
      const stationRecords = records.filter((record) => record.station_id === station.id);
      const average = stationRecords.length
        ? stationRecords.reduce((sum, record) => sum + record.dispatched_liters, 0) / stationRecords.length
        : 0;
      return [station.id, average] as const;
    })
  );

  return records
    .filter((record) => {
      const average = stationAverages.get(record.station_id) ?? 0;
      return average > 0 && record.dispatched_liters > average * multiplier;
    })
    .map((record) => {
      const average = stationAverages.get(record.station_id) ?? 0;
      return { record, average, ratio: average > 0 ? record.dispatched_liters / average : 0 };
    })
    .sort((a, b) => b.ratio - a.ratio);
}
