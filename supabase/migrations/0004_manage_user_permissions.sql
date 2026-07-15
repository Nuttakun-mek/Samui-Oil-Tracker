-- Allow admins to manage user roles from the application while keeping
-- regular users limited to their own display name.

drop policy if exists profiles_update_self on profiles;

create policy profiles_update_self on profiles
  for update
  to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

revoke update on profiles from anon, authenticated;
grant update (full_name) on profiles to authenticated;

create or replace function public.admin_update_user_permissions(
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
