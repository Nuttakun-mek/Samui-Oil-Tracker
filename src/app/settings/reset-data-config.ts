export const OPERATIONAL_DATA_TABLES = [
  'fuel_records',
  'fuel_records_audit',
  'fuel_contracts',
  'delivery_plan_log',
  'monthly_import_summaries',
  'import_file_manifest',
] as const;

export type OperationalDataTable = (typeof OPERATIONAL_DATA_TABLES)[number];
export type OperationalDataCounts = Record<OperationalDataTable, number | null>;
