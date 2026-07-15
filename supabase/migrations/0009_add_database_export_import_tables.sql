-- Support importing the database export package described in database_design_spec.md.
-- The app continues to use stations and fuel_records as the operational source.
-- These tables preserve supplementary contract, monthly, delivery-plan, and file-audit data.

create table if not exists public.fuel_contracts (
  id uuid primary key default gen_random_uuid(),
  contract_code text not null,
  document_no text,
  contract_date_th text,
  contract_date date,
  quantity_liters numeric not null default 0,
  notes text,
  source_file_name text,
  imported_by uuid references public.profiles(id),
  imported_at timestamptz not null default now(),
  unique (contract_code, document_no)
);

create table if not exists public.delivery_plan_log (
  id uuid primary key default gen_random_uuid(),
  station_id text not null references public.stations(id) on delete cascade,
  batch_no text not null,
  day_name text,
  delivery_date date,
  delivery_date_raw_text text not null default '',
  plan_liters numeric not null default 0,
  cumulative_liters numeric not null default 0,
  remaining_liters numeric not null default 0,
  contract_code text,
  source_file text not null,
  snapshot_date date not null,
  imported_by uuid references public.profiles(id),
  imported_at timestamptz not null default now(),
  unique (station_id, batch_no, delivery_date_raw_text, source_file, snapshot_date)
);

create index if not exists delivery_plan_log_station_snapshot_idx
  on public.delivery_plan_log (station_id, snapshot_date desc);

create or replace view public.delivery_plan_current as
select distinct on (station_id, batch_no) *
from public.delivery_plan_log
order by station_id, batch_no, snapshot_date desc, imported_at desc;

create table if not exists public.monthly_import_summaries (
  id uuid primary key default gen_random_uuid(),
  station_id text not null references public.stations(id) on delete cascade,
  year_be smallint not null,
  month_num smallint not null check (month_num between 1 and 12),
  month_label text,
  received_liters numeric not null default 0,
  dispensed_liters numeric not null default 0,
  source text,
  source_file_name text,
  imported_by uuid references public.profiles(id),
  imported_at timestamptz not null default now(),
  unique (station_id, year_be, month_num)
);

create table if not exists public.import_file_manifest (
  id uuid primary key default gen_random_uuid(),
  station_id text references public.stations(id) on delete set null,
  folder_path text,
  file_name text not null,
  file_type text,
  status text,
  note text,
  modified_time timestamptz,
  drive_file_id text,
  imported_by uuid references public.profiles(id),
  imported_at timestamptz not null default now(),
  unique (station_id, file_name, drive_file_id)
);

alter table public.fuel_contracts enable row level security;
alter table public.delivery_plan_log enable row level security;
alter table public.monthly_import_summaries enable row level security;
alter table public.import_file_manifest enable row level security;

drop policy if exists fuel_contracts_select on public.fuel_contracts;
drop policy if exists fuel_contracts_write on public.fuel_contracts;
create policy fuel_contracts_select on public.fuel_contracts for select to authenticated using (true);
create policy fuel_contracts_write on public.fuel_contracts for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists delivery_plan_log_select on public.delivery_plan_log;
drop policy if exists delivery_plan_log_write on public.delivery_plan_log;
create policy delivery_plan_log_select on public.delivery_plan_log for select to authenticated using (public.has_station_access(station_id));
create policy delivery_plan_log_write on public.delivery_plan_log for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists monthly_import_summaries_select on public.monthly_import_summaries;
drop policy if exists monthly_import_summaries_write on public.monthly_import_summaries;
create policy monthly_import_summaries_select on public.monthly_import_summaries for select to authenticated using (public.has_station_access(station_id));
create policy monthly_import_summaries_write on public.monthly_import_summaries for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists import_file_manifest_select on public.import_file_manifest;
drop policy if exists import_file_manifest_write on public.import_file_manifest;
create policy import_file_manifest_select on public.import_file_manifest
  for select to authenticated using (station_id is null or public.has_station_access(station_id));
create policy import_file_manifest_write on public.import_file_manifest
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
