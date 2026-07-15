# ระบบติดตามการใช้น้ำมันเชื้อเพลิง 3 พื้นที่

Next.js 15 + Supabase (Postgres, Auth, RLS) + Vercel

## 1. Setup Supabase

1. สร้างโปรเจกต์ใหม่ที่ [supabase.com](https://supabase.com) (แนะนำ region Singapore ใกล้ไทยสุด)
2. เปิด SQL Editor แล้วรันไฟล์ตามลำดับ:
   - `supabase/migrations/0001_init.sql` — schema + RLS
   - `supabase/migrations/0002_seed_historical.sql` — ข้อมูลย้อนหลังจากไฟล์ Excel เดิม (68 รายการ)
   - `supabase/migrations/0003_harden_rls.sql` — ปรับ policy ให้ปลอดภัยขึ้น
   - `supabase/migrations/0004_manage_user_permissions.sql` — RPC สำหรับจัดการสิทธิ์ผู้ใช้
   - `supabase/migrations/0005_add_employee_code_to_fuel_records.sql` — เก็บรหัสพนักงาน/ผู้รายงาน
   - `supabase/migrations/0006_update_station_names.sql` — ชื่อพื้นที่ใช้งานจริง
   - `supabase/migrations/0007_add_record_source_tracking.sql` — แหล่งที่มาของ record
   - `supabase/migrations/0008_add_source_sheet_tracking.sql` — ชื่อ sheet/แท็บต้นทาง
   - `supabase/migrations/0009_add_database_export_import_tables.sql` — ตารางประกอบสำหรับชุด database export
   - `supabase/migrations/0010_admin_reset_operational_data.sql` — RPC สำหรับล้างข้อมูลนำเข้าโดย admin
3. สร้างผู้ใช้ admin คนแรก: Authentication > Users > Add user (กรอกอีเมล/รหัสผ่าน)
   จากนั้นรัน SQL นี้เพื่อตั้งเป็น admin และให้สิทธิ์ทุกสถานี:
   ```sql
   update profiles set role = 'admin' where id = '<user-id-จากหน้า Authentication>';
   insert into profile_station_access (profile_id, station_id)
     values
       ('<user-id>', 'samui'),
       ('<user-id>', 'phangan'),
       ('<user-id>', 'koh_tao');
   ```
4. สร้างผู้ใช้ field แต่ละพื้นที่แบบเดียวกัน แต่ insert `profile_station_access` เฉพาะสถานีของตัวเอง (role ปล่อย default `field`)
5. คัดลอก Project URL และ anon public key จาก Settings > API

## 2. รันในเครื่อง

```bash
cp .env.example .env.local   # แล้วกรอกค่าจาก Supabase
npm install
npm run dev -- --hostname 127.0.0.1 --port 3500
```

เปิด http://127.0.0.1:3500 — จะ redirect ไปหน้า login อัตโนมัติ

## 3. นำเข้าข้อมูล

หน้า Settings มีปุ่มล้างข้อมูลและช่องนำเข้า 2 แบบ เพื่อไม่ให้ข้อมูลทับซ้อนกันผิดประเภท:

0. `ล้างข้อมูลก่อนนำเข้าใหม่`
   - ต้องพิมพ์ `ล้างข้อมูล` เพื่อยืนยันก่อนกด
   - ล้างเฉพาะ `fuel_records`, `fuel_records_audit`, `fuel_contracts`, `delivery_plan_log`, `monthly_import_summaries`, `import_file_manifest`
   - ไม่ลบผู้ใช้ สิทธิ์ สถานี และค่าตั้งค่าระบบ
   - ต้องรัน migration `0010_admin_reset_operational_data.sql` ก่อนใช้งานปุ่มนี้

1. `นำเข้าข้อมูลย้อนหลัง`
   - ใช้กับไฟล์ Excel/CSV ทั่วไป เช่น `.xls`, `.xlsx`, `.csv`, `.tsv`
   - ระบบอ่านหลายแท็บได้ เลือกสถานที่ได้ แก้ไข preview ก่อนนำเข้าได้
   - บันทึกเข้า `fuel_records` โดยตรง และ Dashboard/History จะเห็นทันที

2. `นำเข้าชุดฐานข้อมูลตาม spec`
   - ใช้กับไฟล์ CSV ตาม `database_design_spec.md`
   - รองรับ `sites.csv`, `fuel_contracts.csv`, `daily_fuel_balance.csv`, `delivery_plan_log.csv`, `monthly_summary.csv`, `file_manifest.csv`
   - ระบบเรียงลำดับนำเข้าเองตาม spec
   - `daily_fuel_balance.csv` ถูกแปลงเข้า `fuel_records`
   - ไฟล์สัญญา แผนจัดส่ง สรุปรายเดือน และ manifest ถูกเก็บในตารางประกอบจาก migration `0009`
   - ถ้าเลือกไฟล์ชนิดเดียวกันซ้ำ ระบบจะเตือนและไม่เลือกไฟล์ท้ายสุดแบบเงียบ ๆ

## 4. Deploy ขึ้น Vercel

```bash
npm i -g vercel
vercel login
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
vercel --prod
```

หรือเชื่อม repo ผ่าน Vercel dashboard แล้วตั้งค่า env vars 2 ตัวข้างต้นในหน้า Project Settings > Environment Variables

## 5. Gen TypeScript types จาก schema จริง (แนะนำหลัง migrate schema)

```bash
npm i -g supabase
supabase login
SUPABASE_PROJECT_ID=xxxx npm run db:types
```

## โครงสร้างสิทธิ์ (RLS)

- `role = 'admin'` — เห็น/แก้ไขทุกสถานี, แก้ค่าตั้งค่าถัง, ลบข้อมูลได้, ดู audit log ได้
- `role = 'field'` — เห็น/แก้ไขได้เฉพาะสถานีที่มีใน `profile_station_access`, ลบไม่ได้ (ลบได้เฉพาะ admin ตาม policy `fuel_records_delete`)
- ทุกการ insert/update/delete บน `fuel_records` ถูกบันทึกลง `fuel_records_audit` อัตโนมัติผ่าน trigger — ตรวจสอบย้อนหลังได้ว่าใครแก้อะไรเมื่อไหร่

## โครงสร้างข้อมูลหลัก

- `stations` — พื้นที่ใช้งานจริง 3 แห่ง
- `fuel_records` — ข้อมูลรับเข้า/ใช้ออก/คงเหลือรายวัน เป็น source หลักของ Dashboard และ History
- `fuel_records_audit` — audit log ของการเพิ่ม แก้ไข ลบ record
- `fuel_contracts`, `delivery_plan_log`, `monthly_import_summaries`, `import_file_manifest` — ข้อมูลประกอบจากชุด database export สำหรับทวนสอบย้อนหลัง

## สิ่งที่ยังไม่ได้ทำ (ต่อยอดได้ตามต้องการ)

- แจ้งเตือนสต๊อกต่ำผ่าน LINE Notify / email — แนะนำทำเป็น Supabase Edge Function + `pg_cron` เรียกทุกวัน เช็คสูตร `days_of_supply` เดียวกับ dashboard แล้วยิง webhook
- PWA / offline entry สำหรับพื้นที่สัญญาณไม่นิ่ง — เพิ่ม `next-pwa` และ IndexedDB queue สำหรับ sync ทีหลัง
- e2e test (Playwright) สำหรับ flow กรอกข้อมูล + คำนวณ closing balance
