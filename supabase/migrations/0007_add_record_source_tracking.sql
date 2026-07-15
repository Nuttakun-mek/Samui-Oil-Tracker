alter table fuel_records
  add column if not exists record_source text not null default 'manual'
    check (record_source in ('manual', 'upload', 'database')),
  add column if not exists source_file_name text,
  add column if not exists source_note text;

update fuel_records
set record_source = case
  when employee_code = 'IMPORT' then 'upload'
  when created_by is null then 'database'
  else coalesce(nullif(record_source, ''), 'manual')
end
where record_source is null
   or record_source = 'manual';

create index if not exists fuel_records_source_idx on fuel_records (record_source);
