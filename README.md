# ระบบติดตามการใช้น้ำมันเชื้อเพลิง 3 เกาะ (สมุย / พะงัน / เกาะเต่า)

Next.js 15 + Supabase (Postgres, Auth, RLS) + Vercel

## 1. Setup Supabase

1. สร้างโปรเจกต์ใหม่ที่ [supabase.com](https://supabase.com) (แนะนำ region Singapore ใกล้ไทยสุด)
2. เปิด SQL Editor แล้วรันไฟล์ตามลำดับ:
   - `supabase/migrations/0001_init.sql` — schema + RLS
   - `supabase/migrations/0002_seed_historical.sql` — ข้อมูลย้อนหลังจากไฟล์ Excel เดิม (68 รายการ)
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
npm run dev
```

เปิด http://localhost:3000 — จะ redirect ไปหน้า login อัตโนมัติ

## 3. Deploy ขึ้น Vercel

```bash
npm i -g vercel
vercel login
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

หรือเชื่อม repo ผ่าน Vercel dashboard แล้วตั้งค่า env vars 2 ตัวข้างต้นในหน้า Project Settings > Environment Variables

## 4. Gen TypeScript types จาก schema จริง (แนะนำหลัง migrate schema)

```bash
npm i -g supabase
supabase login
SUPABASE_PROJECT_ID=xxxx npm run db:types
```

## โครงสร้างสิทธิ์ (RLS)

- `role = 'admin'` — เห็น/แก้ไขทุกสถานี, แก้ค่าตั้งค่าถัง, ลบข้อมูลได้, ดู audit log ได้
- `role = 'field'` — เห็น/แก้ไขได้เฉพาะสถานีที่มีใน `profile_station_access`, ลบไม่ได้ (ลบได้เฉพาะ admin ตาม policy `fuel_records_delete`)
- ทุกการ insert/update/delete บน `fuel_records` ถูกบันทึกลง `fuel_records_audit` อัตโนมัติผ่าน trigger — ตรวจสอบย้อนหลังได้ว่าใครแก้อะไรเมื่อไหร่

## สิ่งที่ยังไม่ได้ทำ (ต่อยอดได้ตามต้องการ)

- แจ้งเตือนสต๊อกต่ำผ่าน LINE Notify / email — แนะนำทำเป็น Supabase Edge Function + `pg_cron` เรียกทุกวัน เช็คสูตร `days_of_supply` เดียวกับ dashboard แล้วยิง webhook
- PWA / offline entry สำหรับพื้นที่สัญญาณไม่นิ่ง — เพิ่ม `next-pwa` และ IndexedDB queue สำหรับ sync ทีหลัง
- Import/merge ข้อมูลย้อนหลังเพิ่มเติมจากไฟล์ Excel อื่นที่ยังไม่ได้ดึง (เช่น แผนจัดส่งน้ำมันโรงจักรเกาะเต่า/PO tracking — คนละ scope กับตารางนี้)
- e2e test (Playwright) สำหรับ flow กรอกข้อมูล + คำนวณ closing balance
