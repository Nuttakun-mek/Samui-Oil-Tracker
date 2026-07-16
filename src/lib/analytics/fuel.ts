import type { FuelRecord, Station } from '@/lib/types/domain';

export function estimatedFuelCost(stations: Station[], records: FuelRecord[]) {
  const priceByStation = new Map(stations.map((station) => [station.id, station.fuel_price_per_liter]));
  return records.reduce(
    (sum, record) => sum + record.dispatched_liters * (priceByStation.get(record.station_id) ?? 0),
    0
  );
}
