-- Audit trail for member/permission changes (role + station access),
-- surfaced admin-only in Settings. Mirrors the fuel_records_audit pattern:
-- writes only happen from security-definer functions / the service-role admin client,
-- so no insert policy is needed for `authenticated`.

create table permission_audit (
  id bigint generated always as identity primary key,
  target_profile_id uuid not null,
  changed_by uuid references profiles(id),
  action text not null check (action in ('created', 'updated')),
  previous_role text,
  new_role text,
  previous_station_ids text[],
  new_station_ids text[],
  changed_at timestamptz not null default now()
);

alter table permission_audit enable row level security;

create policy permission_audit_select on permission_audit
  for select
  to authenticated
  using (public.is_admin());

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

  if target_role not in ('admin', 'field') then
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
