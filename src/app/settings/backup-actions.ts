'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { removeBackup, runBackup, setBackupPinned } from '@/lib/backups/service';
import { restoreBackup } from '@/lib/backups/restore';

async function currentAdminId() {
  await requireAdmin();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ไม่ได้เข้าสู่ระบบ');
  return user.id;
}

function actionError(error: unknown, fallback: string) {
  return { ok: false as const, error: error instanceof Error ? error.message : fallback };
}

export async function saveBackupSettings(formData: FormData) {
  try {
    const userId = await currentAdminId();
    const weeklyDay = Number(formData.get('weekly_day'));
    const weeklyRetention = Number(formData.get('weekly_retention'));
    const monthlyDay = Number(formData.get('monthly_day'));
    const monthlyRetention = Number(formData.get('monthly_retention'));
    const protectLatest = Number(formData.get('protect_latest'));
    const weeklyTime = String(formData.get('weekly_time') ?? '02:00');
    const monthlyTime = String(formData.get('monthly_time') ?? '02:30');
    if (
      !Number.isInteger(weeklyDay) || weeklyDay < 0 || weeklyDay > 6 ||
      !Number.isInteger(weeklyRetention) || weeklyRetention < 1 || weeklyRetention > 52 ||
      !Number.isInteger(monthlyDay) || monthlyDay < 1 || monthlyDay > 28 ||
      !Number.isInteger(monthlyRetention) || monthlyRetention < 1 || monthlyRetention > 60 ||
      !Number.isInteger(protectLatest) || protectLatest < 1 || protectLatest > 20 ||
      !/^\d{2}:\d{2}$/.test(weeklyTime) || !/^\d{2}:\d{2}$/.test(monthlyTime)
    ) {
      return { ok: false as const, error: 'ค่าตาราง Backup ไม่ถูกต้อง' };
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from('backup_settings')
      .update({
        enabled: formData.get('enabled') === 'on',
        weekly_day: weeklyDay,
        weekly_time: weeklyTime,
        weekly_retention: weeklyRetention,
        monthly_day: monthlyDay,
        monthly_time: monthlyTime,
        monthly_retention: monthlyRetention,
        protect_latest: protectLatest,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', true);
    if (error) throw new Error(error.message);
    revalidatePath('/settings');
    return { ok: true as const };
  } catch (error) {
    return actionError(error, 'บันทึกตาราง Backup ไม่สำเร็จ');
  }
}

export async function startManualBackup() {
  try {
    const userId = await currentAdminId();
    const result = await runBackup('manual', userId);
    revalidatePath('/settings');
    return { ok: true as const, result };
  } catch (error) {
    return actionError(error, 'สำรองข้อมูลไม่สำเร็จ');
  }
}

export async function toggleBackupPin(fileId: string, pinned: boolean) {
  try {
    await currentAdminId();
    await setBackupPinned(fileId, pinned);
    revalidatePath('/settings');
    return { ok: true as const };
  } catch (error) {
    return actionError(error, 'เปลี่ยนการปักหมุดไม่สำเร็จ');
  }
}

export async function deleteBackupFile(fileId: string) {
  try {
    await currentAdminId();
    await removeBackup(fileId);
    revalidatePath('/settings');
    return { ok: true as const };
  } catch (error) {
    return actionError(error, 'ลบไฟล์สำรองไม่สำเร็จ');
  }
}

export async function disconnectGoogleDrive() {
  try {
    const userId = await currentAdminId();
    const admin = createAdminClient();
    const { error } = await admin
      .from('backup_settings')
      .update({
        enabled: false,
        google_connected_email: null,
        google_drive_folder_id: null,
        google_refresh_token_encrypted: null,
        connected_at: null,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', true);
    if (error) throw new Error(error.message);
    revalidatePath('/settings');
    return { ok: true as const };
  } catch (error) {
    return actionError(error, 'ยกเลิกการเชื่อม Google Drive ไม่สำเร็จ');
  }
}

export async function startRestore(input: {
  fileId: string;
  confirmation: string;
  mode: 'replace' | 'merge';
}) {
  try {
    const userId = await currentAdminId();
    const result = await restoreBackup({ ...input, restoredBy: userId });
    revalidatePath('/settings');
    revalidatePath('/dashboard');
    revalidatePath('/entry');
    revalidatePath('/history');
    revalidatePath('/reports');
    return { ok: true as const, result };
  } catch (error) {
    return actionError(error, 'Restore ไม่สำเร็จ');
  }
}

