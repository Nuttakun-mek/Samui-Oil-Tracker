-- Add a third role tier: viewer (read + export only, no insert/update on fuel_records).
-- Existing 'field' rows become 'editor' — same capabilities, clearer name alongside 'viewer'.

alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin', 'editor', 'viewer', 'field'));

update profiles set role = 'editor' where role = 'field';

alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin', 'editor', 'viewer'));
alter table profiles alter column role set default 'viewer';

-- helper: can the current user write to fuel_records for this station?
-- admin always can; editor can only for stations they're assigned to; viewer never.
create or replace function public.can_edit_station(target_station text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from profiles p
    join profile_station_access a on a.profile_id = p.id
    where p.id = auth.uid() and p.role = 'editor' and a.station_id = target_station
  );
$$;

drop policy if exists fuel_records_insert on fuel_records;
drop policy if exists fuel_records_update on fuel_records;

create policy fuel_records_insert on fuel_records
  for insert
  to authenticated
  with check (public.can_edit_station(station_id));

create policy fuel_records_update on fuel_records
  for update
  to authenticated
  using (public.can_edit_station(station_id))
  with check (public.can_edit_station(station_id));

-- widen the role check in the permission-management RPC to the 3 tiers
create or replace function public.admin_update_user_permissions(
  target_profile_id uuid,
  target_role text,
  target_station_ids text[]
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  prev_role text;
  prev_station_ids text[];
begin
  if not public.is_admin() then
    raise exception 'admin permission required';
  end if;

  if target_role not in ('admin', 'editor', 'viewer') then
    raise exception 'invalid role';
  end if;

  select role into prev_role from public.profiles where id = target_profile_id;
  select coalesce(array_agg(station_id order by station_id), array[]::text[])
    into prev_station_ids
    from public.profile_station_access
    where profile_id = target_profile_id;

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

  insert into public.permission_audit (
    target_profile_id, changed_by, action, previous_role, new_role, previous_station_ids, new_station_ids
  ) values (
    target_profile_id, auth.uid(), 'updated', prev_role, target_role, prev_station_ids,
    coalesce((select array_agg(station_id order by station_id) from unnest(target_station_ids) as station_id), array[]::text[])
  );
end;
$$;

revoke all on function public.admin_update_user_permissions(uuid, text, text[]) from public;
grant execute on function public.admin_update_user_permissions(uuid, text, text[]) to authenticated;
