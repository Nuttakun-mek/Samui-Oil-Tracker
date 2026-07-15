-- Admin-only reset for operational/imported data.
-- Keeps stations, settings, users, roles, and station access.

create or replace function public.admin_reset_operational_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  table_list text;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select string_agg(format('%I.%I', n.nspname, c.relname), ', ')
    into table_list
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(array[
      'fuel_records',
      'fuel_records_audit',
      'delivery_plan_log',
      'monthly_import_summaries',
      'import_file_manifest',
      'fuel_contracts'
    ])
    and c.relkind in ('r', 'p');

  if table_list is not null then
    execute 'truncate table ' || table_list || ' restart identity';
  end if;
end;
$$;

revoke all on function public.admin_reset_operational_data() from public;
grant execute on function public.admin_reset_operational_data() to authenticated;
