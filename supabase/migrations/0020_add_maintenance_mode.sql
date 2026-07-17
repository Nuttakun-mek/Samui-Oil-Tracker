-- โหมดกำลังปรับปรุงระบบ — admin เปิด/ปิดได้ก่อน-หลัง deploy เพื่อกันไม่ให้ผู้ใช้ทั่วไป
-- เขียนข้อมูล (บันทึก/แก้ไข) ชนกับตอนระบบสลับเวอร์ชัน โดย admin เองยังใช้งานได้ปกติ
create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  maintenance_mode boolean not null default false,
  maintenance_message text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists app_settings_select on public.app_settings;
drop policy if exists app_settings_write on public.app_settings;
-- อ่านได้ทุกคนที่ล็อกอิน (ต้องเห็นแบนเนอร์) เขียนได้เฉพาะ admin
create policy app_settings_select on public.app_settings for select to authenticated using (true);
create policy app_settings_write on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
