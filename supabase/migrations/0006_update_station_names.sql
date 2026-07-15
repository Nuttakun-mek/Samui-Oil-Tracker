-- Update station display names to match the official operating areas.

update stations
set name = case id
  when 'samui' then 'สถานีไฟฟ้าสมุย 1 (บ้านพังกา)'
  when 'phangan' then 'พื้นที่ติดตั้งเครื่องกำเนิดไฟฟ้าชั่วคราว ต.ลิปะน้อย'
  when 'koh_tao' then 'โรงจักร เกาะเต่า'
  else name
end
where id in ('samui', 'phangan', 'koh_tao');
