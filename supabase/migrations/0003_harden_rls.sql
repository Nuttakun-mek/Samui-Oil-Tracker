-- Harden existing RLS policies after 0001_init.sql.
-- This migration is safe to run on projects that already applied the initial schema.

drop policy if exists profiles_select_self on profiles;
drop policy if exists profiles_update_self on profiles;
drop policy if exists fuel_records_update on fuel_records;

create policy profiles_select_self on profiles
  for select
  to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy profiles_update_self on profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Prevent authenticated clients from changing security-sensitive profile fields.
-- Admin role changes should be performed through trusted SQL/service-role tooling.
revoke update on profiles from anon, authenticated;
grant update (full_name) on profiles to authenticated;

create policy fuel_records_update on fuel_records
  for update
  to authenticated
  using (public.has_station_access(station_id))
  with check (public.has_station_access(station_id));
