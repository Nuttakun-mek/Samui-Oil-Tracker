-- Store the configurable fuel-price multiplier used for budget estimates.

alter table public.stations
  add column if not exists fuel_price_per_liter numeric not null default 0
  check (fuel_price_per_liter >= 0);
