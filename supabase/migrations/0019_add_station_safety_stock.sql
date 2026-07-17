-- Safety stock ต่อพื้นที่ (ลิตร) — ปริมาณขั้นต่ำที่ต้องกันสำรองไว้เสมอ
-- ใช้คำนวณ "คาดว่าใช้ได้อีกกี่วันก่อนถึงจุด safety stock" และแจ้งเตือนเมื่อคงเหลือต่ำกว่าเกณฑ์
alter table public.stations
  add column if not exists safety_stock_liters numeric not null default 0;
