alter table fuel_records
  add column if not exists source_sheet_name text;
