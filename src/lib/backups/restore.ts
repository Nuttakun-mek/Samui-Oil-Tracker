import { randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { decodeBackup, sha256 } from './crypto';
import { downloadDriveFile } from './google-drive';
import { getBackupSettings, runBackup } from './service';
import { getGoogleAccessToken } from './google-drive';
import type { BackupPayload, BackupTableName } from './types';

const DELETE_ORDER: BackupTableName[] = [
  'fuel_record_documents',
  'fuel_contract_documents',
  'delivery_plan_log',
  'monthly_import_summaries',
  'import_file_manifest',
  'fuel_group_baseline',
  'fuel_contracts',
  'fuel_records',
  'fuel_records_audit',
  'profile_station_access',
  'permission_audit',
];

const INSERT_ORDER: BackupTableName[] = [
  'stations',
  'profiles',
  'profile_station_access',
  'fuel_contracts',
  'fuel_group_baseline',
  'fuel_records',
  'delivery_plan_log',
  'monthly_import_summaries',
  'import_file_manifest',
  'fuel_record_documents',
  'fuel_contract_documents',
  'fuel_records_audit',
  'permission_audit',
];

const USER_ID_COLUMNS: Partial<Record<BackupTableName, string[]>> = {
  profiles: ['id'],
  profile_station_access: ['profile_id'],
  fuel_records: ['created_by', 'updated_by'],
  fuel_records_audit: ['changed_by'],
  fuel_contracts: ['imported_by'],
  delivery_plan_log: ['imported_by'],
  monthly_import_summaries: ['imported_by'],
  import_file_manifest: ['imported_by'],
  permission_audit: ['target_profile_id', 'changed_by'],
  fuel_record_documents: ['uploaded_by'],
  fuel_group_baseline: ['set_by'],
  fuel_contract_documents: ['uploaded_by'],
};

async function listCurrentAuthUsers() {
  const admin = createAdminClient();
  const users: Array<{ id: string; email: string | null }> = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    users.push(...data.users.map((user) => ({ id: user.id, email: user.email?.toLowerCase() ?? null })));
    if (data.users.length < 1000) break;
    page += 1;
  }
  return users;
}

async function buildUserIdMap(payload: BackupPayload) {
  const admin = createAdminClient();
  const currentUsers = await listCurrentAuthUsers();
  const currentByEmail = new Map(currentUsers.filter((user) => user.email).map((user) => [user.email!, user.id]));
  const backupProfiles = new Map(payload.tables.profiles.map((row) => [String(row.id), row]));
  const idMap = new Map<string, string>();
  const warnings: string[] = [];

  for (const oldUser of payload.authUsers) {
    const email = oldUser.email?.toLowerCase() ?? null;
    const sameId = currentUsers.find((user) => user.id === oldUser.id);
    if (sameId) {
      idMap.set(oldUser.id, oldUser.id);
      continue;
    }
    if (email && currentByEmail.has(email)) {
      idMap.set(oldUser.id, currentByEmail.get(email)!);
      continue;
    }
    if (!email) {
      warnings.push(`ไม่สามารถสร้างบัญชีเดิม ${oldUser.id.slice(0, 8)} ได้ เพราะไม่มีอีเมล`);
      continue;
    }

    const profile = backupProfiles.get(oldUser.id);
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: randomBytes(32).toString('base64url'),
      email_confirm: true,
      user_metadata: { full_name: profile?.full_name ?? email },
    });
    if (error || !data.user) {
      throw new Error(`สร้างบัญชี ${email} ระหว่าง restore ไม่สำเร็จ: ${error?.message ?? 'unknown error'}`);
    }
    idMap.set(oldUser.id, data.user.id);
    currentByEmail.set(email, data.user.id);
    warnings.push(`สร้างบัญชี ${email} ใหม่แล้ว ต้องตั้งรหัสผ่านใหม่ก่อนเข้าใช้งาน`);
  }

  return { idMap, warnings };
}

function remapRows(table: BackupTableName, rows: Record<string, unknown>[], idMap: Map<string, string>) {
  const columns = USER_ID_COLUMNS[table] ?? [];
  return rows.flatMap((source) => {
    const row = { ...source };
    for (const column of columns) {
      const oldValue = row[column];
      if (!oldValue) continue;
      const mapped = idMap.get(String(oldValue));
      if (mapped) {
        row[column] = mapped;
      } else if ((table === 'profiles' && column === 'id') || (table === 'profile_station_access' && column === 'profile_id')) {
        return [];
      } else if (table === 'permission_audit' && column === 'target_profile_id') {
        return [];
      } else {
        row[column] = null;
      }
    }
    if (table === 'fuel_records_audit' || table === 'permission_audit') delete row.id;
    return [row];
  });
}

async function deleteRows(table: BackupTableName) {
  const admin = createAdminClient();
  const { error } = await admin.from(table).delete().not(
    table === 'profile_station_access' ? 'profile_id' : table === 'fuel_group_baseline' ? 'procurement_group' : 'id',
    'is',
    null
  );
  if (error) throw new Error(`ล้าง ${table} ก่อน restore ไม่สำเร็จ: ${error.message}`);
}

async function insertRows(table: BackupTableName, rows: Record<string, unknown>[]) {
  const admin = createAdminClient();
  for (let offset = 0; offset < rows.length; offset += 500) {
    const chunk = rows.slice(offset, offset + 500);
    const query = table === 'stations' || table === 'profiles'
      ? admin.from(table).upsert(chunk)
      : admin.from(table).insert(chunk);
    const { error } = await query;
    if (error) throw new Error(`คืนค่า ${table} ไม่สำเร็จ: ${error.message}`);
  }
}

type StorageItem = { id?: string | null; name: string; metadata?: Record<string, unknown> | null };

async function listStorageFiles(bucket: string, prefix = ''): Promise<string[]> {
  const admin = createAdminClient();
  const paths: string[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) {
      if (error.message.toLowerCase().includes('not found')) return paths;
      throw new Error(error.message);
    }
    const page = (data ?? []) as StorageItem[];
    for (const item of page) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id && !item.metadata) paths.push(...(await listStorageFiles(bucket, path)));
      else if (item.name !== '.emptyFolderPlaceholder') paths.push(path);
    }
    if (page.length < 1000) break;
    offset += 1000;
  }
  return paths;
}

async function replaceStorage(payload: BackupPayload) {
  const admin = createAdminClient();
  const buckets = Array.from(new Set(['fuel-documents', ...payload.storage.map((file) => file.bucket)]));
  for (const bucket of buckets) {
    const { error: bucketError } = await admin.storage.getBucket(bucket);
    if (bucketError) {
      const { error: createError } = await admin.storage.createBucket(bucket, { public: false });
      if (createError) throw new Error(`สร้าง Storage bucket ${bucket} ไม่สำเร็จ: ${createError.message}`);
    }
    const existing = await listStorageFiles(bucket);
    for (let offset = 0; offset < existing.length; offset += 100) {
      const { error } = await admin.storage.from(bucket).remove(existing.slice(offset, offset + 100));
      if (error) throw new Error(`ล้างเอกสารเดิมใน ${bucket} ไม่สำเร็จ: ${error.message}`);
    }
  }

  for (const file of payload.storage) {
    const buffer = Buffer.from(file.base64, 'base64');
    if (buffer.length !== file.size || sha256(buffer) !== file.sha256) {
      throw new Error(`Checksum เอกสาร ${file.bucket}/${file.path} ไม่ถูกต้อง`);
    }
    const { error } = await admin.storage.from(file.bucket).upload(file.path, buffer, {
      contentType: file.mimeType,
      upsert: true,
    });
    if (error) throw new Error(`คืนค่าเอกสาร ${file.path} ไม่สำเร็จ: ${error.message}`);
  }
}

export async function restoreBackup(input: {
  fileId: string;
  restoredBy: string;
  confirmation: string;
  mode?: 'replace' | 'merge';
}) {
  if (process.env.BACKUP_RESTORE_ENABLED !== 'true') {
    throw new Error('ระบบ Restore ถูกปิดไว้ ให้ตั้งค่า BACKUP_RESTORE_ENABLED=true หลังทดสอบแผนกู้คืนแล้ว');
  }

  const admin = createAdminClient();
  const { data: job, error: jobError } = await admin
    .from('backup_jobs')
    .select('*')
    .eq('drive_file_id', input.fileId)
    .single();
  if (jobError || !job) throw new Error('ไม่พบข้อมูลไฟล์สำรองในระบบ');
  if (input.confirmation !== `RESTORE ${job.file_name}`) {
    throw new Error('ข้อความยืนยัน Restore ไม่ถูกต้อง');
  }

  const { data: audit, error: auditError } = await admin
    .from('backup_restore_audit')
    .insert({
      backup_job_id: job.id,
      drive_file_id: input.fileId,
      file_name: job.file_name,
      mode: input.mode ?? 'replace',
      restored_by: input.restoredBy,
      status: 'running',
    })
    .select('id')
    .single();
  if (auditError) throw new Error(auditError.message);

  try {
    const settings = await getBackupSettings();
    if (!settings.google_refresh_token_encrypted) throw new Error('Google Drive ไม่ได้เชื่อมต่อ');
    const accessToken = await getGoogleAccessToken(settings.google_refresh_token_encrypted);
    const buffer = await downloadDriveFile(accessToken, input.fileId);
    if (job.package_sha256 && sha256(buffer) !== job.package_sha256) {
      throw new Error('Checksum ไฟล์บน Google Drive ไม่ถูกต้อง จึงยกเลิกการ Restore');
    }
    const payload = decodeBackup(buffer);
    // A verified, pinned rollback point is created before any operational data changes.
    await runBackup('manual', input.restoredBy);
    const { idMap, warnings } = await buildUserIdMap(payload);
    const mode = input.mode ?? 'replace';

    if (mode === 'replace') {
      for (const table of DELETE_ORDER) await deleteRows(table);
      await replaceStorage(payload);
    }

    let restoredRecordCount = 0;
    for (const table of INSERT_ORDER) {
      if (mode === 'merge' && ['fuel_records_audit', 'permission_audit'].includes(table)) continue;
      if (table === 'fuel_records_audit') await deleteRows('fuel_records_audit');
      const rows = remapRows(table, payload.tables[table] ?? [], idMap);
      if (!rows.length) continue;
      await insertRows(table, rows);
      restoredRecordCount += rows.length;
    }

    if (mode === 'merge') {
      for (const file of payload.storage) {
        const fileBuffer = Buffer.from(file.base64, 'base64');
        if (sha256(fileBuffer) !== file.sha256) throw new Error(`Checksum เอกสาร ${file.path} ไม่ถูกต้อง`);
        const { error } = await admin.storage.from(file.bucket).upload(file.path, fileBuffer, {
          contentType: file.mimeType,
          upsert: true,
        });
        if (error) throw new Error(`คืนค่าเอกสาร ${file.path} ไม่สำเร็จ: ${error.message}`);
      }
    }

    await admin
      .from('backup_restore_audit')
      .update({
        status: 'completed',
        restored_record_count: restoredRecordCount,
        restored_document_count: payload.storage.length,
        warning_message: warnings.join('\n') || null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', audit.id);

    return {
      ok: true as const,
      restoredRecordCount,
      restoredDocumentCount: payload.storage.length,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Restore ไม่สำเร็จ';
    await admin
      .from('backup_restore_audit')
      .update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() })
      .eq('id', audit.id);
    throw error;
  }
}
