-- Store the reporting employee code on every fuel record for audit and traceability.

alter table fuel_records
  add column if not exists employee_code text;

update fuel_records
set employee_code = coalesce(employee_code, 'LEGACY')
where employee_code is null;
