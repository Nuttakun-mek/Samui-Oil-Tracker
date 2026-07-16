-- เอกสารแนบประจำ record น้ำมันรายวัน (ใบส่งน้ำมัน, รูปถ่าย ฯลฯ)
-- ไฟล์จริงเก็บใน Storage bucket "fuel-documents" (private) — เข้าถึงผ่าน server action
-- ที่ใช้ service role + ตรวจสิทธิ์ในโค้ด ตารางนี้เก็บ metadata และคุมสิทธิ์ด้วย RLS

create table fuel_record_documents (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references fuel_records(id) on delete cascade,
  station_id text not null references stations(id),
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null default 0,
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz not null default now()
);

create index fuel_record_documents_record_idx on fuel_record_documents (record_id);

alter table fuel_record_documents enable row level security;

create policy record_documents_select on fuel_record_documents
  for select
  to authenticated
  using (public.has_station_access(station_id));

create policy record_documents_insert on fuel_record_documents
  for insert
  to authenticated
  with check (public.can_edit_station(station_id));

create policy record_documents_delete on fuel_record_documents
  for delete
  to authenticated
  using (
    public.is_admin()
    or (public.can_edit_station(station_id) and uploaded_by = (select auth.uid()))
  );
