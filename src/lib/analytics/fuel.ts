import type { FuelRecord, Station } from '@/lib/types/domain';

export function stationCoverage(station: Station, records: FuelRecord[], sampleDays = 7) {
  const stationRecords = records.filter((record) => record.station_id === station.id);
  const latest = stationRecords.at(-1) ?? null;
  const sample = stationRecords.slice(-sampleDays);
  const averageDailyUsage = sample.length
    ? sample.reduce((sum, record) => sum + record.dispatched_liters, 0) / sample.length
    : 0;
  const remainingLiters = latest?.closing_liters ?? 0;
  const daysRemaining = averageDailyUsage > 0 ? remainingLiters / averageDailyUsage : null;

  return {
    latest,
    remainingLiters,
    averageDailyUsage,
    daysRemaining,
    sampleSize: sample.length,
  };
}

export function estimatedFuelCost(stations: Station[], records: FuelRecord[]) {
  const priceByStation = new Map(stations.map((station) => [station.id, station.fuel_price_per_liter]));
  return records.reduce(
    (sum, record) => sum + record.dispatched_liters * (priceByStation.get(record.station_id) ?? 0),
    0
  );
}
