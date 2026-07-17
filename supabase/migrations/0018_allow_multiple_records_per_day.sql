-- อนุญาตให้มีหลายรายการต่อสถานีต่อวัน — น้ำมัน 1 วันอาจส่งมากกว่า 1 เที่ยว
-- แต่ละเที่ยวเป็น record แยก โดยเรียงลำดับภายในวันด้วย created_at
-- (เดิม unique (station_id, record_date) ทำให้การกรอกซ้ำวันเดิมถูกเขียนทับเงียบๆ)

alter table public.fuel_records
  drop constraint if exists fuel_records_station_id_record_date_key;

create index if not exists fuel_records_station_date_created_idx
  on public.fuel_records (station_id, record_date, created_at);
