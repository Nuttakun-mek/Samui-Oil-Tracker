import { APP_RELEASE } from '@/lib/app-version';
import { createAdminClient } from '@/lib/supabase/admin';
import { sha256 } from './crypto';
import {
  deleteDriveBackup,
  downloadDriveFile,
  ensureBackupFolder,
  getGoogleAccessToken,
  listDriveBackups,
  updateDriveBackupProperties,
  uploadBackupToDrive,
} from './google-drive';
import { buildBackupPackage } from './package';
import type { BackupJobRow, BackupSettingsRow, BackupTag, BackupTrigger, DriveBackupFile } from './types';

const BANGKOK_TIME_ZONE = 'Asia/Bangkok';

function bangkokParts(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BANGKOK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<string, string>;
}

export function bangkokDateKey(value: string | Date) {
  const part = bangkokParts(value);
  return `${part.year}-${part.month}-${part.day}`;
}

function backupFileName(trigger: BackupTrigger, createdAt: string) {
  const part = bangkokParts(createdAt);
  return `oil-tracker_full_${part.year}-${part.month}-${part.day}_${part.hour}-${part.minute}-${part.second}+07_${trigger}.oilbackup`;
}

function tagsOf(file: DriveBackupFile) {
  return file.appProperties.backupTags?.split(',').filter(Boolean) as BackupTag[] | undefined;
}

export async function getBackupSettings() {
  const admin = createAdminClient();
  const { data, error } = await admin.from('backup_settings').select('*').eq('id', true).single();
  if (error) throw new Error(error.message);
  return data as BackupSettingsRow;
}

async function getDriveConnection(settings?: BackupSettingsRow) {
  const resolved = settings ?? (await getBackupSettings());
  if (!resolved.google_refresh_token_encrypted) {
    throw new Error('ยังไม่ได้เชื่อม Google Drive ในหน้าตั้งค่า');
  }
  const accessToken = await getGoogleAccessToken(resolved.google_refresh_token_encrypted);
  const folderId = await ensureBackupFolder(accessToken, resolved.google_drive_folder_id);
  if (folderId !== resolved.google_drive_folder_id) {
    const admin = createAdminClient();
    await admin.from('backup_settings').update({ google_drive_folder_id: folderId, updated_at: new Date().toISOString() }).eq('id', true);
  }
  return { settings: resolved, accessToken, folderId };
}

async function verifyRemoteFile(accessToken: string, file: DriveBackupFile, expectedSha256: string) {
  const downloaded = await downloadDriveFile(accessToken, file.id);
  if (sha256(downloaded) !== expectedSha256) {
    throw new Error('Checksum ของไฟล์บน Google Drive ไม่ตรงกับไฟล์ต้นฉบับ');
  }
  return downloaded.length;
}

async function applyRetention(accessToken: string, folderId: string, settings: BackupSettingsRow) {
  const admin = createAdminClient();
  const files = (await listDriveBackups(accessToken, folderId)).sort(
    (a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
  );
  const keep = new Set<string>();

  for (const file of files.filter((item) => item.appProperties.pinned === 'true')) keep.add(file.id);
  for (const file of files.slice(0, settings.protect_latest)) keep.add(file.id);
  for (const file of files.filter((item) => tagsOf(item)?.includes('weekly')).slice(0, settings.weekly_retention)) keep.add(file.id);
  for (const file of files.filter((item) => tagsOf(item)?.includes('monthly')).slice(0, settings.monthly_retention)) keep.add(file.id);

  const deletedIds: string[] = [];
  for (const file of files) {
    if (keep.has(file.id)) continue;
    await deleteDriveBackup(accessToken, file.id);
    deletedIds.push(file.id);
  }

  if (deletedIds.length) {
    await admin
      .from('backup_jobs')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() })
      .in('drive_file_id', deletedIds);
  }
  return deletedIds;
}

async function reuseWeeklyAsMonthly(input: {
  accessToken: string;
  folderId: string;
  settings: BackupSettingsRow;
}) {
  const admin = createAdminClient();
  const today = bangkokDateKey(new Date());
  const files = await listDriveBackups(input.accessToken, input.folderId);
  const weekly = files.find((file) => {
    const tags = tagsOf(file) ?? [];
    const createdAt = file.appProperties.createdAt || file.createdTime;
    return tags.includes('weekly') && bangkokDateKey(createdAt) === today && file.appProperties.sha256;
  });
  if (!weekly) return null;

  const tags = Array.from(new Set([...(tagsOf(weekly) ?? []), 'monthly'])) as BackupTag[];
  await verifyRemoteFile(input.accessToken, weekly, weekly.appProperties.sha256);
  await updateDriveBackupProperties(input.accessToken, weekly.id, { tags });
  await admin
    .from('backup_jobs')
    .update({ tags, verification_status: 'verified', verified_at: new Date().toISOString() })
    .eq('drive_file_id', weekly.id);
  await admin
    .from('backup_settings')
    .update({ last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', true);
  await applyRetention(input.accessToken, input.folderId, input.settings);
  return { reused: true as const, fileName: weekly.name, fileId: weekly.id };
}

export async function runBackup(trigger: BackupTrigger, createdBy: string | null = null) {
  const admin = createAdminClient();
  const settings = await getBackupSettings();
  if (trigger !== 'manual' && !settings.enabled) {
    return { skipped: true as const, reason: 'automatic_backup_disabled' };
  }

  const { accessToken, folderId } = await getDriveConnection(settings);
  if (trigger === 'monthly') {
    const reused = await reuseWeeklyAsMonthly({ accessToken, folderId, settings });
    if (reused) return reused;
  }

  const createdAt = new Date().toISOString();
  const tags: BackupTag[] = [trigger];
  const pinned = trigger === 'manual';
  const fileName = backupFileName(trigger, createdAt);
  const { data: job, error: jobError } = await admin
    .from('backup_jobs')
    .insert({
      trigger_type: trigger,
      tags,
      status: 'running',
      file_name: fileName,
      pinned,
      app_version: APP_RELEASE.version,
      schema_version: '0017',
      created_by: createdBy,
      started_at: createdAt,
    })
    .select('*')
    .single();
  if (jobError) throw new Error(jobError.message);

  try {
    const backup = await buildBackupPackage();
    const uploaded = await uploadBackupToDrive({
      accessToken,
      folderId,
      fileName,
      buffer: backup.buffer,
      sha256: backup.sha256,
      tags,
      pinned,
      createdAt,
    });
    const fileId = String(uploaded.id ?? '');
    if (!fileId) throw new Error('Google Drive ไม่ส่ง file ID กลับมา');

    await admin
      .from('backup_jobs')
      .update({
        status: 'verifying',
        drive_file_id: fileId,
        drive_folder_id: folderId,
        package_size_bytes: backup.buffer.length,
        package_sha256: backup.sha256,
        record_count: backup.payload.manifest.recordCount,
        document_count: backup.payload.manifest.documentCount,
      })
      .eq('id', job.id);

    const remoteFiles = await listDriveBackups(accessToken, folderId);
    const remoteFile = remoteFiles.find((file) => file.id === fileId);
    if (!remoteFile) throw new Error('ไม่พบไฟล์ที่เพิ่งอัปโหลดบน Google Drive');
    await verifyRemoteFile(accessToken, remoteFile, backup.sha256);

    const completedAt = new Date().toISOString();
    await admin
      .from('backup_jobs')
      .update({
        status: 'completed',
        verification_status: 'verified',
        completed_at: completedAt,
        verified_at: completedAt,
      })
      .eq('id', job.id);
    await admin
      .from('backup_settings')
      .update({ last_backup_at: completedAt, last_verified_at: completedAt, updated_at: completedAt })
      .eq('id', true);

    const deletedIds = await applyRetention(accessToken, folderId, settings);
    return {
      ok: true as const,
      jobId: String(job.id),
      fileId,
      fileName,
      size: backup.buffer.length,
      recordCount: backup.payload.manifest.recordCount,
      documentCount: backup.payload.manifest.documentCount,
      deletedCount: deletedIds.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'สำรองข้อมูลไม่สำเร็จ';
    await admin
      .from('backup_jobs')
      .update({ status: 'failed', verification_status: 'failed', error_message: message, completed_at: new Date().toISOString() })
      .eq('id', job.id);
    throw error;
  }
}

export async function setBackupPinned(fileId: string, pinned: boolean) {
  const admin = createAdminClient();
  const { accessToken } = await getDriveConnection();
  await updateDriveBackupProperties(accessToken, fileId, { pinned });
  const { error } = await admin.from('backup_jobs').update({ pinned }).eq('drive_file_id', fileId);
  if (error) throw new Error(error.message);
}

export async function removeBackup(fileId: string) {
  const admin = createAdminClient();
  const { accessToken } = await getDriveConnection();
  const { data: job } = await admin.from('backup_jobs').select('pinned').eq('drive_file_id', fileId).maybeSingle();
  if (job?.pinned) throw new Error('ต้องยกเลิกการปักหมุดก่อนลบไฟล์สำรอง');
  await deleteDriveBackup(accessToken, fileId);
  const { error } = await admin
    .from('backup_jobs')
    .update({ status: 'deleted', deleted_at: new Date().toISOString() })
    .eq('drive_file_id', fileId);
  if (error) throw new Error(error.message);
}

export async function listBackupJobs(limit = 50) {
  const admin = createAdminClient();
  const { data, error } = await admin.from('backup_jobs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as BackupJobRow[];
}

