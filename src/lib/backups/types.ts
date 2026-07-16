export const BACKUP_TABLES = [
  'stations',
  'profiles',
  'profile_station_access',
  'fuel_records',
  'fuel_records_audit',
  'fuel_contracts',
  'delivery_plan_log',
  'monthly_import_summaries',
  'import_file_manifest',
  'permission_audit',
  'fuel_record_documents',
  'fuel_group_baseline',
  'fuel_contract_documents',
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number];
export type BackupTrigger = 'manual' | 'weekly' | 'monthly';
export type BackupTag = BackupTrigger;

export type BackupStorageFile = {
  bucket: string;
  path: string;
  mimeType: string;
  size: number;
  sha256: string;
  base64: string;
};

export type BackupAuthUser = {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
};

export type BackupPayload = {
  manifest: {
    format: 'pea-oil-backup';
    formatVersion: 1;
    schemaVersion: '0017';
    appVersion: string;
    createdAt: string;
    sourceProjectUrl: string;
    tableCounts: Record<BackupTableName, number>;
    recordCount: number;
    documentCount: number;
    authNote: string;
  };
  authUsers: BackupAuthUser[];
  tables: Record<BackupTableName, Record<string, unknown>[]>;
  storage: BackupStorageFile[];
};

export type EncryptedBackupEnvelope = {
  format: 'pea-oil-backup-encrypted';
  formatVersion: 1;
  algorithm: 'AES-256-GCM';
  compression: 'gzip';
  createdAt: string;
  iv: string;
  authTag: string;
  payloadSha256: string;
  ciphertext: string;
};

export type DriveBackupFile = {
  id: string;
  name: string;
  size: number;
  createdTime: string;
  modifiedTime: string;
  md5Checksum?: string;
  appProperties: Record<string, string>;
};

export type BackupSettingsRow = {
  id: boolean;
  enabled: boolean;
  timezone: string;
  weekly_day: number;
  weekly_time: string;
  weekly_retention: number;
  monthly_day: number;
  monthly_time: string;
  monthly_retention: number;
  protect_latest: number;
  google_connected_email: string | null;
  google_drive_folder_id: string | null;
  google_refresh_token_encrypted: string | null;
  connected_at: string | null;
  last_backup_at: string | null;
  last_verified_at: string | null;
  updated_at: string;
};

export type BackupJobRow = {
  id: string;
  trigger_type: BackupTrigger;
  tags: BackupTag[];
  status: 'queued' | 'running' | 'verifying' | 'completed' | 'failed' | 'deleted' | 'missing';
  file_name: string | null;
  drive_file_id: string | null;
  package_size_bytes: number | null;
  package_sha256: string | null;
  record_count: number;
  document_count: number;
  verification_status: 'pending' | 'verified' | 'failed';
  pinned: boolean;
  app_version: string | null;
  error_message: string | null;
  created_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  verified_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

