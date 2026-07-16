-- Big-lot fuel procurement tracking: pooled balance per procurement group.
-- Groups: group_samui (samui + phangan/ลิปะน้อย stations, pooled) and group_koh_tao (koh_tao alone).
-- Reuses fuel_contracts for lot entries instead of a parallel table; existing rows stay
-- procurement_group = null (historical/reference-only, excluded from the live balance).

alter table public.fuel_contracts
  add column if not exists procurement_group text
    check (procurement_group is null or procurement_group in ('group_samui', 'group_koh_tao'));

create table if not exists public.fuel_group_baseline (
  procurement_group text primary key check (procurement_group in ('group_samui', 'group_koh_tao')),
  baseline_liters numeric not null default 0,
  baseline_date date not null,
  warn_below_liters numeric not null default 0,
  note text,
  set_by uuid references public.profiles(id),
  set_at timestamptz not null default now()
);

alter table public.fuel_group_baseline enable row level security;

drop policy if exists fuel_group_baseline_select on public.fuel_group_baseline;
drop policy if exists fuel_group_baseline_write on public.fuel_group_baseline;
create policy fuel_group_baseline_select on public.fuel_group_baseline for select to authenticated using (true);
create policy fuel_group_baseline_write on public.fuel_group_baseline for all to authenticated using (public.is_admin()) with check (public.is_admin());
