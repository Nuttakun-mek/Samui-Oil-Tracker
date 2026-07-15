'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, Database, Trash2 } from 'lucide-react';
import { resetOperationalData } from './actions';
import {
  OPERATIONAL_DATA_TABLES,
  type OperationalDataCounts,
  type OperationalDataTable,
} from './reset-data-config';

const CONFIRM_TEXT = 'ล้างข้อมูล';

const TABLE_LABELS: Record<OperationalDataTable, string> = {
  fuel_records: 'บันทึกน้ำมัน',
  fuel_records_audit: 'ประวัติการแก้ไข',
  fuel_contracts: 'สัญญาน้ำมัน',
  delivery_plan_log: 'แผนการจัดส่ง',
  monthly_import_summaries: 'สรุปรายเดือน',
  import_file_manifest: 'รายการไฟล์นำเข้า',
};

interface ResetDataPanelProps {
  initialCounts: OperationalDataCounts;
}

export function ResetDataPanel({ initialCounts }: ResetDataPanelProps) {
  const [confirmText, setConfirmText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [counts, setCounts] = useState(initialCounts);
  const [isPending, startTransition] = useTransition();
  const canReset = confirmText.trim() === CONFIRM_TEXT && !isPending;
  const total = OPERATIONAL_DATA_TABLES.reduce((sum, table) => sum + (counts[table] ?? 0), 0);

  const onReset = () => {
    if (!canReset) return;

    startTransition(async () => {
      const result = await resetOperationalData();
      if (result.after) setCounts(result.after);
      if (result.ok) {
        setConfirmText('');
        setIsSuccess(true);
        setMessage(result.warning ?? 'ล้างข้อมูลทั้งหมดเรียบร้อย พร้อมนำเข้าข้อมูลใหม่');
      } else {
        setIsSuccess(false);
        setMessage(result.error);
      }
    });
  };

  return (
    <section id="data-reset" className="scroll-mt-32 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-950">เตรียมฐานข้อมูลชุดใหม่</h2>
          <p className="text-sm text-slate-600">
            ล้างข้อมูลน้ำมันและข้อมูลนำเข้าทั้งหมด โดยเก็บผู้ใช้ สิทธิ์ สถานี และค่าระบบไว้
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-sm font-extrabold text-slate-700">
          <Database size={17} className="text-teal-700" aria-hidden="true" />
          ปัจจุบัน {total.toLocaleString('th-TH')} รายการ
        </div>
      </div>

      <div className="panel space-y-4 border-red-200">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {OPERATIONAL_DATA_TABLES.map((table) => (
            <div key={table} className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-xs font-semibold text-slate-600">{TABLE_LABELS[table]}</span>
              <span className="text-sm font-extrabold tabular-nums text-slate-950">
                {counts[table] === null ? 'ตรวจไม่ได้' : counts[table].toLocaleString('th-TH')}
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-800">
          การดำเนินการนี้ย้อนกลับไม่ได้ โปรดตรวจว่าไฟล์ข้อมูลชุดใหม่พร้อมแล้วก่อนยืนยัน
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <label className="field-label">พิมพ์ “{CONFIRM_TEXT}” เพื่อยืนยัน</label>
            <input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              className="field border-red-200 focus:border-red-500 focus:ring-red-100"
              placeholder={CONFIRM_TEXT}
            />
          </div>
          <button
            type="button"
            onClick={onReset}
            disabled={!canReset}
            className="h-10 w-full rounded-md bg-red-700 px-4 text-sm font-extrabold text-white shadow-sm hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-300 lg:w-auto"
          >
            <Trash2 size={17} aria-hidden="true" />
            {isPending ? 'กำลังล้างและตรวจสอบ...' : 'ล้างข้อมูลทั้งหมด'}
          </button>
        </div>

        {message && (
          <div
            role="status"
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
              isSuccess
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {isSuccess ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
            <span className="whitespace-pre-wrap">{message}</span>
          </div>
        )}
      </div>
    </section>
  );
}
