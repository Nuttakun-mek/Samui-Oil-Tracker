import { createAdminClient } from '@/lib/supabase/admin';
import { APP_RELEASE } from '@/lib/app-version';
import { encodeBackup, sha256 } from './crypto';
import { BACKUP_TABLES, type BackupAuthUser, type BackupPayload, type BackupStorageFile, type BackupTableName } from './types';

const STORAGE_BUCKETS = ['fuel-documents'] as const;
const PAGE_SIZE = 1000;

function stableRowKey(row: Record<string, unknown>) {
  return JSON.stringify(
    Object.keys(row)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = row[key];
        return result;
      }, {})
  );
}

async function readAllRows(table: BackupTableName) {
  const admin = createAdminClient();
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await admin.from(table).select('*').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows.sort((a, b) => stableRowKey(a).localeCompare(stableRowKey(b)));
}

async function readAuthUsers() {
  const admin = createAdminClient();
  const users: BackupAuthUser[] = [];
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(`auth.users: ${error.message}`);
    for (const user of data.users) {
      users.push({
        id: user.id,
        email: user.email ?? null,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
      });
    }
    if (data.users.length < PAGE_SIZE) break;
    page += 1;
  }

  return users.sort((a, b) => a.id.localeCompare(b.id));
}

type ListedStorageObject = {
  id?: string | null;
  name: string;
  metadata?: { mimetype?: string; size?: number } | null;
};

async function listStoragePaths(bucket: string, prefix = ''): Promise<Array<{ path: string; metadata: ListedStorageObject['metadata'] }>> {
  const admin = createAdminClient();
  const results: Array<{ path: string; metadata: ListedStorageObject['metadata'] }> = [];
  let offset = 0;

  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) {
      if (error.message.toLowerCase().includes('not found')) return results;
      throw new Error(`Storage ${bucket}/${prefix}: ${error.message}`);
    }

    const page = (data ?? []) as ListedStorageObject[];
    for (const item of page) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id && !item.metadata) {
        results.push(...(await listStoragePaths(bucket, path)));
      } else if (item.name !== '.emptyFolderPlaceholder') {
        results.push({ path, metadata: item.metadata });
      }
    }

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return results;
}

async function readStorageFiles() {
  const admin = createAdminClient();
  const files: BackupStorageFile[] = [];
  const maxBytes = Number(process.env.BACKUP_MAX_SIZE_MB ?? 250) * 1024 * 1024;
  let totalBytes = 0;

  for (const bucket of STORAGE_BUCKETS) {
    const paths = await listStoragePaths(bucket);
    for (const item of paths) {
      const { data, error } = await admin.storage.from(bucket).download(item.path);
      if (error || !data) throw new Error(`ดาวน์โหลดเอกสาร ${bucket}/${item.path} ไม่สำเร็จ: ${error?.message ?? 'ไม่พบไฟล์'}`);
      const buffer = Buffer.from(await data.arrayBuffer());
      totalBytes += buffer.length;
      if (totalBytes > maxBytes) {
        throw new Error(`เอกสารรวมเกินขนาดสำรองสูงสุด ${Math.round(maxBytes / 1024 / 1024)} MB`);
      }
      files.push({
        bucket,
        path: item.path,
        mimeType: item.metadata?.mimetype || data.type || 'application/octet-stream',
        size: buffer.length,
        sha256: sha256(buffer),
        base64: buffer.toString('base64'),
      });
    }
  }

  return files.sort((a, b) => `${a.bucket}/${a.path}`.localeCompare(`${b.bucket}/${b.path}`));
}

export async function buildBackupPackage() {
  const createdAt = new Date().toISOString();
  const tableEntries = await Promise.all(
    BACKUP_TABLES.map(async (table) => [table, await readAllRows(table)] as const)
  );
  const tables = Object.fromEntries(tableEntries) as BackupPayload['tables'];
  const [authUsers, storage] = await Promise.all([readAuthUsers(), readStorageFiles()]);
  const tableCounts = Object.fromEntries(
    BACKUP_TABLES.map((table) => [table, tables[table].length])
  ) as Record<BackupTableName, number>;
  const recordCount = Object.values(tableCounts).reduce((sum, count) => sum + count, 0);

  const payload: BackupPayload = {
    manifest: {
      format: 'pea-oil-backup',
      formatVersion: 1,
      schemaVersion: '0017',
      appVersion: APP_RELEASE.version,
      createdAt,
      sourceProjectUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      tableCounts,
      recordCount,
      documentCount: storage.length,
      authNote: 'เก็บข้อมูลบัญชีเพื่อทวนสอบเท่านั้น ไม่สำรองรหัสผ่านหรือ session ของผู้ใช้',
    },
    authUsers,
    tables,
    storage,
  };

  const buffer = encodeBackup(payload);
  return {
    payload,
    buffer,
    sha256: sha256(buffer),
  };
}

