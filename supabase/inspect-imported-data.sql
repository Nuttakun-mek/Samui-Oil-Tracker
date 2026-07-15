-- Inspect imported fuel records.
-- Run in Supabase SQL Editor after importing data.

-- 1) Overall summary
select
  count(*) as total_records,
  count(distinct station_id) as station_count,
  min(record_date) as first_record_date,
  max(record_date) as last_record_date,
  sum(opening_liters) as total_opening_liters,
  sum(received_liters) as total_received_liters,
  sum(plan_received_liters) as total_plan_received_liters,
  sum(dispatched_liters) as total_dispatched_liters,
  sum(closing_liters) as total_closing_liters
from public.fuel_records;

-- 2) Summary by station
select
  r.station_id,
  s.name as station_name,
  count(*) as record_count,
  min(r.record_date) as first_record_date,
  max(r.record_date) as last_record_date,
  sum(r.received_liters) as received_liters,
  sum(r.dispatched_liters) as dispatched_liters,
  sum(r.closing_liters) as closing_liters
from public.fuel_records r
left join public.stations s on s.id = r.station_id
group by r.station_id, s.name
order by r.station_id;

-- 3) Daily totals
select
  record_date,
  count(*) as station_records,
  sum(received_liters) as received_liters,
  sum(dispatched_liters) as dispatched_liters,
  sum(closing_liters) as closing_liters
from public.fuel_records
group by record_date
order by record_date desc;

-- 4) Check invalid negative values
select *
from public.fuel_records
where opening_liters < 0
   or received_liters < 0
   or plan_received_liters < 0
   or dispatched_liters < 0
   or coalesce(dispatched_namsaeng, 0) < 0
   or coalesce(dispatched_kfp, 0) < 0
   or closing_liters < 0
order by record_date desc, station_id;

-- 5) Check closing balance mismatch.
-- Expected closing = opening + received - dispatched.
select
  id,
  station_id,
  record_date,
  opening_liters,
  received_liters,
  dispatched_liters,
  closing_liters,
  (opening_liters + received_liters - dispatched_liters) as expected_closing_liters,
  closing_liters - (opening_liters + received_liters - dispatched_liters) as difference_liters
from public.fuel_records
where abs(closing_liters - (opening_liters + received_liters - dispatched_liters)) > 0.001
order by record_date desc, station_id;

-- 6) Koh Tao dispatch breakdown check.
select
  id,
  station_id,
  record_date,
  dispatched_liters,
  dispatched_namsaeng,
  dispatched_kfp,
  coalesce(dispatched_namsaeng, 0) + coalesce(dispatched_kfp, 0) as expected_dispatched_liters,
  dispatched_liters - (coalesce(dispatched_namsaeng, 0) + coalesce(dispatched_kfp, 0)) as difference_liters
from public.fuel_records
where station_id = 'koh_tao'
  and abs(dispatched_liters - (coalesce(dispatched_namsaeng, 0) + coalesce(dispatched_kfp, 0))) > 0.001
order by record_date desc;

-- 7) Latest records
select *
from public.fuel_records
order by record_date desc, station_id
limit 50;

-- 8) Employee code check.
-- If this fails with "column does not exist", run migration 0005 first.
select
  count(*) filter (where employee_code is null or btrim(employee_code) = '') as missing_employee_code,
  count(*) filter (where employee_code = 'IMPORT') as imported_default_code,
  count(*) as total_records
from public.fuel_records;
