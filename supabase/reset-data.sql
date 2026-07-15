-- Reset operational/imported data before entering real records.
-- Keeps station master data, station settings, users, and permissions.
-- Run this in Supabase SQL Editor when you want to clear only fuel/import data.

begin;

truncate table if exists public.fuel_records_audit restart identity;
truncate table if exists public.fuel_records restart identity cascade;
truncate table if exists public.delivery_plan_log restart identity;
truncate table if exists public.monthly_import_summaries restart identity;
truncate table if exists public.import_file_manifest restart identity;
truncate table if exists public.fuel_contracts restart identity;

commit;

-- Optional full account reset:
-- Uncomment only if you also want to remove every login account, profile,
-- and station permission assignment. You will need to create a new admin user.
--
-- begin;
-- truncate table if exists public.fuel_records_audit restart identity;
-- truncate table if exists public.fuel_records restart identity cascade;
-- truncate table if exists public.delivery_plan_log restart identity;
-- truncate table if exists public.monthly_import_summaries restart identity;
-- truncate table if exists public.import_file_manifest restart identity;
-- truncate table if exists public.fuel_contracts restart identity;
-- delete from public.profile_station_access;
-- delete from public.profiles;
-- delete from auth.users;
-- commit;
