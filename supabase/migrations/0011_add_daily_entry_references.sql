-- Keep the operational references needed to audit each daily entry.

alter table public.fuel_records
  add column if not exists vehicle_plate text,
  add column if not exists reference_document_no text,
  add column if not exists contract_code text;

create index if not exists fuel_records_contract_code_idx
  on public.fuel_records (contract_code)
  where contract_code is not null;
