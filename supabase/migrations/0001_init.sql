-- ============================================================
-- Oil Tracker — 3 พื้นที่ (บ้านพังกา / ลิปะน้อย / โรงจักรเกาะเต่า)
-- Initial schema: stations, profiles, access, fuel_records, audit
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- stations ----------
create table stations (
  id text primary key,                         -- 'samui' | 'phangan' | 'koh_tao'
  name text not null,                           -- ชื่อแสดงผล
  tank_capacity_liters numeric not null default 0,
  low_stock_days numeric not null default 5,
  has_dispatch_breakdown boolean not null default false, -- true เฉพาะเกาะเต่า (นำแสง/เครื่องกฟภ.)
  created_at timestamptz not null default now()
);

insert into stations (id, name, tank_capacity_liters, low_stock_days, has_dispatch_breakdown) values
  ('samui',   'สถานีไฟฟ้าสมุย 1 (บ้านพังกา)',              150000, 5, false),
  ('phangan', 'พื้นที่ติดตั้งเครื่องกำเนิดไฟฟ้าชั่วคราว ต.ลิปะน้อย', 150000, 5, false),
  ('koh_tao', 'โรงจักร เกาะเต่า',              200000, 5, true);

-- ---------- profiles (extends auth.users) ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'field' check (role in ('admin','field')),
  created_at timestamptz not null default now()
);

-- auto-create profile row when a new auth user signs up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- which stations a profile may read/write ----------
create table profile_station_access (
  profile_id uuid not null references profiles(id) on delete cascade,
  station_id text not null references stations(id) on delete cascade,
  primary key (profile_id, station_id)
);

-- ---------- fuel_records: one row per station per day ----------
create table fuel_records (
  id uuid primary key default gen_random_uuid(),
  station_id text not null references stations(id),
  record_date date not null,
  opening_liters numeric not null default 0,
  received_liters numeric not null default 0,
  plan_received_liters numeric not null default 0,
  dispatched_liters numeric not null default 0,        -- total (auto = namsaeng+kfp when applicable)
  dispatched_namsaeng numeric,                          -- เกาะเต่าเท่านั้น
  dispatched_kfp numeric,                               -- เกาะเต่าเท่านั้น
  closing_liters numeric not null default 0,
  employee_code text,
  note text,
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (station_id, record_date)
);

create index fuel_records_station_date_idx on fuel_records (station_id, record_date desc);

-- ---------- audit log ----------
create table fuel_records_audit (
  id bigint generated always as identity primary key,
  record_id uuid not null,
  action text not null,                                 -- insert | update | delete
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

create function public.fuel_records_audit_fn()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into fuel_records_audit(record_id, action, changed_by, new_data)
    values (new.id, 'insert', new.created_by, to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    new.updated_at := now();
    insert into fuel_records_audit(record_id, action, changed_by, old_data, new_data)
    values (new.id, 'update', new.updated_by, to_jsonb(old), to_jsonb(new));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into fuel_records_audit(record_id, action, changed_by, old_data)
    values (old.id, 'delete', auth.uid(), to_jsonb(old));
    return old;
  end if;
end;
$$;

create trigger fuel_records_audit_trigger
  before insert or update or delete on fuel_records
  for each row execute procedure public.fuel_records_audit_fn();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table stations enable row level security;
alter table profiles enable row level security;
alter table profile_station_access enable row level security;
alter table fuel_records enable row level security;
alter table fuel_records_audit enable row level security;

-- helper: is the current user an admin?
create function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- helper: does the current user have access to a given station?
create function public.has_station_access(target_station text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from profile_station_access
    where profile_id = auth.uid() and station_id = target_station
  );
$$;

-- stations: everyone signed in can read; only admin can modify
create policy stations_select on stations for select using (auth.uid() is not null);
create policy stations_write on stations for all using (public.is_admin()) with check (public.is_admin());

-- profiles: users see their own row; admins see all
create policy profiles_select_self on profiles for select to authenticated using (id = (select auth.uid()) or public.is_admin());
create policy profiles_update_self on profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- Users may update their own display name. Role changes go through an admin-only RPC below.
revoke update on profiles from anon, authenticated;
grant update (full_name) on profiles to authenticated;

-- profile_station_access: admins manage; users can read their own assignment
create policy access_select on profile_station_access for select using (profile_id = auth.uid() or public.is_admin());
create policy access_write on profile_station_access for all using (public.is_admin()) with check (public.is_admin());

create function public.admin_update_user_permissions(
  target_profile_id uuid,
  target_role text,
  target_station_ids text[]
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin permission required';
  end if;

  if target_role not in ('admin', 'field') then
    raise exception 'invalid role';
  end if;

  update public.profiles
  set role = target_role
  where id = target_profile_id;

  delete from public.profile_station_access
  where profile_id = target_profile_id;

  if target_station_ids is not null and cardinality(target_station_ids) > 0 then
    insert into public.profile_station_access (profile_id, station_id)
    select target_profile_id, station_id
    from unnest(target_station_ids) as station_id
    where exists (select 1 from public.stations where id = station_id)
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.admin_update_user_permissions(uuid, text, text[]) from public;
grant execute on function public.admin_update_user_permissions(uuid, text, text[]) to authenticated;

-- fuel_records: read/write only for stations the user has access to
create policy fuel_records_select on fuel_records for select using (public.has_station_access(station_id));
create policy fuel_records_insert on fuel_records for insert with check (public.has_station_access(station_id));
create policy fuel_records_update on fuel_records for update to authenticated
  using (public.has_station_access(station_id))
  with check (public.has_station_access(station_id));
create policy fuel_records_delete on fuel_records for delete using (public.is_admin());

-- audit log: admin-only read, no direct writes (trigger uses security definer)
create policy audit_select on fuel_records_audit for select using (public.is_admin());
