'use client';

import { useState, useTransition } from 'react';
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  DatabaseBackup,
  HardDriveDownload,
  Pin,
  PinOff,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { BackupJobRow, BackupSettingsRow } from '@/lib/backups/types';
import {
  deleteBackupFile,
  disconnectGoogleDrive,
  saveBackupSettings,
  startManualBackup,
  startRestore,
  toggleBackupPin,
} from './backup-actions';

type SafeBackupSettings = Omit<BackupSettingsRow, 'google_refresh_token_encrypted'>;

const STATUS_LABEL: Record<BackupJobRow['status'], string> = {
  queued: 'รอดำเนินการ',
  running: 'กำลังสำรอง',
  verifying: 'กำลังตรวจสอบ',
  completed: 'พร้อมใช้งาน',
  failed: 'ไม่สำเร็จ',
  deleted: 'ลบแล้ว',
  missing: 'ไม่พบไฟล์',
};

function formatBytes(value: number | null) {
  if (!value) return '-';
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function BackupRestorePanel({
  settings,
  jobs,
  schemaReady,
  setupError,
  restoreEnabled,
  oauthMessage,
}: {
  settings: SafeBackupSettings | null;
  jobs: BackupJobRow[];
  schemaReady: boolean;
  setupError?: string | null;
  restoreEnabled: boolean;
  oauthMessage?: string | null;
}) {
  const [message, setMessage] = useState<string | null>(oauthMessage ?? null);
  const [restoreJob, setRestoreJob] = useState<BackupJobRow | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');
  const [isPending, startTransition] = useTransition();
  const connected = Boolean(settings?.google_connected_email);

  const run = (operation: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await operation();
      setMessage(result.ok ? success : result.error ?? 'ดำเนินการไม่สำเร็จ');
    });
  };

  if (!schemaReady) {
    return (
      <section className="panel border-amber-200 bg-amber-50">
        <h2 className="text-base font-extrabold text-amber-950">ยังไม่ได้ติดตั้งโครงสร้าง Backup</h2>
        <p className="mt-1 text-sm text-amber-800">{setupError || 'ต้องใช้ migration 0017_add_backup_restore_system.sql ก่อนเปิดใช้งาน'}</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className={`rounded-md border px-3.5 py-2.5 text-sm font-semibold ${message.includes('ไม่') || message.includes('error') ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {message}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">Google Drive</h2>
            <p className="text-sm text-slate-600">โฟลเดอร์ Oil Tracker Backups</p>
          </div>
          {connected ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              {settings?.google_connected_email}
            </div>
          ) : null}
        </div>

        <div className="panel flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {connected ? <Cloud className="h-5 w-5" /> : <CloudOff className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-slate-950">{connected ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้เชื่อมต่อ'}</div>
              <div className="truncate text-sm text-slate-600">{connected ? `เชื่อมเมื่อ ${formatDate(settings?.connected_at ?? null)}` : 'ใช้บัญชี Google Drive ส่วนตัว'}</div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a href="/api/settings/backups/google/connect" className="btn-primary">
              <Cloud className="h-4 w-4" />
              {connected ? 'เชื่อมบัญชีใหม่' : 'เชื่อม Google Drive'}
            </a>
            {connected && (
              <button type="button" className="btn-secondary" disabled={isPending} onClick={() => run(disconnectGoogleDrive, 'ยกเลิกการเชื่อมต่อแล้ว')}>
                <CloudOff className="h-4 w-4" />
                ยกเลิกการเชื่อมต่อ
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-950">ตารางสำรองและการเก็บรักษา</h2>
          <p className="text-sm text-slate-600">เวลา Asia/Bangkok · ลบอัตโนมัติหลังไฟล์ชุดใหม่ผ่านการตรวจสอบ</p>
        </div>
        <form action={(formData) => run(() => saveBackupSettings(formData), 'บันทึกตาราง Backup แล้ว')} className="panel space-y-4">
          <label className="flex items-center gap-3 border-b border-slate-200 pb-4 text-sm font-bold text-slate-900">
            <input type="checkbox" name="enabled" defaultChecked={settings?.enabled} className="h-4 w-4 accent-[#722257]" />
            เปิด Backup อัตโนมัติ
          </label>

          <input type="hidden" name="weekly_day" value="0" />
          <input type="hidden" name="weekly_time" value="02:00" />
          <input type="hidden" name="monthly_day" value="1" />
          <input type="hidden" name="monthly_time" value="02:30" />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="field-label">Backup รายสัปดาห์</label>
              <div className="field flex items-center bg-slate-50 font-semibold">วันอาทิตย์ 02:00 น.</div>
            </div>
            <div>
              <label className="field-label">เก็บรายสัปดาห์</label>
              <div className="relative">
                <input type="number" name="weekly_retention" min={1} max={52} defaultValue={settings?.weekly_retention ?? 3} className="field pr-14" />
                <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-slate-500">ชุด</span>
              </div>
            </div>
            <div>
              <label className="field-label">Backup รายเดือน</label>
              <div className="field flex items-center bg-slate-50 font-semibold">วันที่ 1 เวลา 02:30 น.</div>
            </div>
            <div>
              <label className="field-label">เก็บรายเดือน</label>
              <div className="relative">
                <input type="number" name="monthly_retention" min={1} max={60} defaultValue={settings?.monthly_retention ?? 12} className="field pr-14" />
                <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-slate-500">ชุด</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:max-w-xs">
              <label className="field-label">ป้องกันไฟล์ล่าสุดเสมอ</label>
              <div className="relative">
                <input type="number" name="protect_latest" min={1} max={20} defaultValue={settings?.protect_latest ?? 3} className="field pr-14" />
                <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-slate-500">ชุด</span>
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={isPending || !connected}>
              <Save className="h-4 w-4" />
              บันทึกการตั้งค่า
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">ไฟล์สำรอง</h2>
            <p className="text-sm text-slate-600">ล่าสุด {formatDate(settings?.last_verified_at ?? null)}</p>
          </div>
          <button type="button" className="btn-primary" disabled={isPending || !connected} onClick={() => run(startManualBackup, 'สร้างและตรวจสอบ Manual Backup สำเร็จ')}>
            {isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
            Backup ตอนนี้
          </button>
        </div>

        <div className="table-shell">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-3.5 py-2.5 text-left">วันที่</th>
                <th className="px-3.5 py-2.5 text-left">ไฟล์</th>
                <th className="px-3.5 py-2.5 text-left">รอบ</th>
                <th className="px-3.5 py-2.5 text-right">ข้อมูล</th>
                <th className="px-3.5 py-2.5 text-right">เอกสาร</th>
                <th className="px-3.5 py-2.5 text-right">ขนาด</th>
                <th className="px-3.5 py-2.5 text-left">สถานะ</th>
                <th className="px-3.5 py-2.5 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">ยังไม่มีไฟล์สำรอง</td></tr>
              )}
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-slate-200 align-middle hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3.5 py-3 tabular-nums">{formatDate(job.created_at)}</td>
                  <td className="max-w-[280px] truncate px-3.5 py-3 font-semibold text-slate-900" title={job.file_name ?? ''}>{job.file_name ?? '-'}</td>
                  <td className="px-3.5 py-3">{job.tags.map((tag) => tag === 'manual' ? 'Manual' : tag === 'weekly' ? 'รายสัปดาห์' : 'รายเดือน').join(' + ')}</td>
                  <td className="px-3.5 py-3 text-right tabular-nums">{job.record_count.toLocaleString('th-TH')}</td>
                  <td className="px-3.5 py-3 text-right tabular-nums">{job.document_count.toLocaleString('th-TH')}</td>
                  <td className="px-3.5 py-3 text-right tabular-nums">{formatBytes(job.package_size_bytes)}</td>
                  <td className="px-3.5 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold ${job.status === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : job.status === 'failed' ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                      {job.verification_status === 'verified' && <ShieldCheck className="h-3.5 w-3.5" />}
                      {STATUS_LABEL[job.status]}
                    </span>
                  </td>
                  <td className="px-3.5 py-3">
                    {job.drive_file_id && job.status === 'completed' ? (
                      <div className="flex justify-end gap-1">
                        <button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" title={job.pinned ? 'ยกเลิกปักหมุด' : 'ปักหมุด'} aria-label={job.pinned ? `ยกเลิกปักหมุด ${job.file_name}` : `ปักหมุด ${job.file_name}`} onClick={() => run(() => toggleBackupPin(job.drive_file_id!, !job.pinned), job.pinned ? 'ยกเลิกปักหมุดแล้ว' : 'ปักหมุดแล้ว')}>
                          {job.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                        </button>
                        <button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40" title={restoreEnabled ? 'Restore' : 'Restore ถูกปิดใน environment นี้'} aria-label={`Restore ${job.file_name}`} disabled={!restoreEnabled} onClick={() => { setRestoreJob(job); setConfirmation(''); }}>
                          <HardDriveDownload className="h-4 w-4" />
                        </button>
                        <button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:opacity-40" title="ลบ" aria-label={`ลบ ${job.file_name}`} disabled={job.pinned} onClick={() => { if (confirm(`ลบไฟล์ ${job.file_name} จาก Google Drive?`)) run(() => deleteBackupFile(job.drive_file_id!), 'ลบไฟล์สำรองแล้ว'); }}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {restoreJob && (
        <section className="panel border-brand-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">Restore ข้อมูล</h2>
              <p className="mt-1 break-all text-sm text-slate-600">{restoreJob.file_name}</p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => setRestoreJob(null)}>ปิด</button>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr_auto] lg:items-end">
            <div>
              <label className="field-label">รูปแบบ Restore</label>
              <select className="field" value={restoreMode} onChange={(event) => setRestoreMode(event.target.value as 'replace' | 'merge')}>
                <option value="replace">แทนที่ข้อมูลเดิมทั้งหมด</option>
                <option value="merge">รวมกับข้อมูลปัจจุบัน</option>
              </select>
            </div>
            <div>
              <label className="field-label">พิมพ์ RESTORE ตามด้วยชื่อไฟล์เพื่อยืนยัน</label>
              <input className="field font-mono text-xs" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={`RESTORE ${restoreJob.file_name}`} />
            </div>
            <button type="button" className="btn-primary" disabled={isPending || confirmation !== `RESTORE ${restoreJob.file_name}`} onClick={() => run(() => startRestore({ fileId: restoreJob.drive_file_id!, confirmation, mode: restoreMode }), 'Restore และตรวจสอบข้อมูลสำเร็จ')}>
              <HardDriveDownload className="h-4 w-4" />
              เริ่ม Restore
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
