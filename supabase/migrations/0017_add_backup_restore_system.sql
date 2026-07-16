-- Portable full-data backups to a user-owned Google Drive.
-- Credentials are only read through the service-role server client. Authenticated
-- users receive column-level access to non-secret settings and admin-only job logs.

create table if not exists public.backup_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  timezone text not null default 'Asia/Bangkok',
  weekly_day smallint not null default 0 check (weekly_day between 0 and 6),
  weekly_time time not null default '02:00',
  weekly_retention smallint not null default 3 check (weekly_retention between 1 and 52),
  monthly_day smallint not null default 1 check (monthly_day between 1 and 28),
  monthly_time time not null default '02:30',
  monthly_retention smallint not null default 12 check (monthly_retention between 1 and 60),
  protect_latest smallint not null default 3 check (protect_latest between 1 and 20),
  google_connected_email text,
  google_drive_folder_id text,
  google_refresh_token_encrypted text,
  connected_at timestamptz,
  last_backup_at timestamptz,
  last_verified_at timestamptz,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.backup_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.backup_jobs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null check (trigger_type in ('manual', 'weekly', 'monthly')),
  tags text[] not null default array[]::text[],
  status text not null default 'queued'
    check (status in ('queued', 'running', 'verifying', 'completed', 'failed', 'deleted', 'missing')),
  file_name text,
  drive_file_id text unique,
  drive_folder_id text,
  package_size_bytes bigint,
  package_sha256 text,
  record_count integer not null default 0,
  document_count integer not null default 0,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'failed')),
  pinned boolean not null default false,
  app_version text,
  schema_version text,
  error_message text,
  created_by uuid references public.profiles(id),
  started_at timestamptz,
  completed_at timestamptz,
  verified_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists backup_jobs_created_idx
  on public.backup_jobs (created_at desc);
create index if not exists backup_jobs_status_idx
  on public.backup_jobs (status, created_at desc);

create table if not exists public.backup_restore_audit (
  id uuid primary key default gen_random_uuid(),
  backup_job_id uuid references public.backup_jobs(id) on delete set null,
  drive_file_id text,
  file_name text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  mode text not null default 'replace' check (mode in ('replace', 'merge')),
  restored_record_count integer not null default 0,
  restored_document_count integer not null default 0,
  warning_message text,
  error_message text,
  restored_by uuid not null references public.profiles(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.backup_settings enable row level security;
alter table public.backup_jobs enable row level security;
alter table public.backup_restore_audit enable row level security;

drop policy if exists backup_settings_admin_select on public.backup_settings;
create policy backup_settings_admin_select on public.backup_settings
  for select to authenticated using (public.is_admin());

drop policy if exists backup_jobs_admin_select on public.backup_jobs;
create policy backup_jobs_admin_select on public.backup_jobs
  for select to authenticated using (public.is_admin());

drop policy if exists backup_restore_audit_admin_select on public.backup_restore_audit;
create policy backup_restore_audit_admin_select on public.backup_restore_audit
  for select to authenticated using (public.is_admin());

-- Keep OAuth credentials inaccessible through the authenticated Data API role.
revoke all on public.backup_settings from anon, authenticated;
grant select (
  id, enabled, timezone, weekly_day, weekly_time, weekly_retention,
  monthly_day, monthly_time, monthly_retention, protect_latest,
  google_connected_email, google_drive_folder_id, connected_at,
  last_backup_at, last_verified_at, updated_by, updated_at
) on public.backup_settings to authenticated;

revoke all on public.backup_jobs from anon, authenticated;
grant select on public.backup_jobs to authenticated;

revoke all on public.backup_restore_audit from anon, authenticated;
grant select on public.backup_restore_audit to authenticated;

