'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  STATION_IDS,
  STATION_LABEL,
  computeClosing,
  type FuelRecord,
  type FuelRecordFormValues,
  type StationId,
} from '@/lib/types/domain';
import { updateFuelRecord } from '../entry/actions';

function toNumber(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function EditRecordButton({ record }: { record: FuelRecord }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const initialStation = record.station_id;
  const initialClosing = useMemo(
    () =>
      computeClosing({
        station_id: record.station_id,
        opening_liters: record.opening_liters,
        received_liters: record.received_liters,
        dispatched_liters: record.dispatched_liters,
        dispatched_namsaeng: record.dispatched_namsaeng ?? 0,
        dispatched_kfp: record.dispatched_kfp ?? 0,
      }),
    [record]
  );

  const onSubmit = (formData: FormData) => {
    setMessage(null);
    const stationId = String(formData.get('station_id')) as StationId;
    const values: FuelRecordFormValues = {
      station_id: stationId,
      record_date: String(formData.get('record_date') ?? ''),
      opening_liters: toNumber(formData.get('opening_liters')),
      received_liters: toNumber(formData.get('received_liters')),
      plan_received_liters: toNumber(formData.get('plan_received_liters')),
      dispatched_liters: toNumber(formData.get('dispatched_liters')),
      dispatched_namsaeng: toNumber(formData.get('dispatched_namsaeng')),
      dispatched_kfp: toNumber(formData.get('dispatched_kfp')),
      employee_code: String(formData.get('employee_code') ?? '').trim(),
      note: String(formData.get('note') ?? '').trim(),
    };

    startTransition(async () => {
      const result = await updateFuelRecord(record.id, values);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setMessage(result.error);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
      >
        แก้ไข
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-xl bg-white p-4 shadow-2xl sm:rounded-xl sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">แก้ไข record</h2>
                <p className="text-sm text-slate-500">ปรับข้อมูลที่นำเข้าแล้ว และบันทึกกลับเข้าระบบ</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary px-3 py-1 text-sm">
                ปิด
              </button>
            </div>

            <form action={onSubmit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="field-label">พื้นที่</label>
                  <select name="station_id" defaultValue={initialStation} className="field">
                    {STATION_IDS.map((stationId) => (
                      <option key={stationId} value={stationId}>
                        {STATION_LABEL[stationId]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">วันที่</label>
                  <input name="record_date" type="date" defaultValue={record.record_date} className="field" />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="field-label">ยอดยกมา</label>
                  <input name="opening_liters" type="number" step="0.01" defaultValue={record.opening_liters} className="field" />
                </div>
                <div>
                  <label className="field-label">รับจริง</label>
                  <input name="received_liters" type="number" step="0.01" defaultValue={record.received_liters} className="field" />
                </div>
                <div>
                  <label className="field-label">แผนรับ</label>
                  <input
                    name="plan_received_liters"
                    type="number"
                    step="0.01"
                    defaultValue={record.plan_received_liters}
                    className="field"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="field-label">ยอดจ่ายรวม</label>
                  <input name="dispatched_liters" type="number" step="0.01" defaultValue={record.dispatched_liters} className="field" />
                </div>
                <div>
                  <label className="field-label">นำแสง</label>
                  <input
                    name="dispatched_namsaeng"
                    type="number"
                    step="0.01"
                    defaultValue={record.dispatched_namsaeng ?? 0}
                    className="field"
                  />
                </div>
                <div>
                  <label className="field-label">กฟภ.</label>
                  <input name="dispatched_kfp" type="number" step="0.01" defaultValue={record.dispatched_kfp ?? 0} className="field" />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="field-label">รหัสพนักงาน</label>
                  <input name="employee_code" defaultValue={record.employee_code ?? ''} className="field" />
                </div>
                <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
                  <div className="text-xs font-bold text-teal-700">ยอดคงเหลือเดิมที่ระบบคำนวณ</div>
                  <div className="mt-1 text-xl font-extrabold text-teal-900 tabular-nums">
                    {Math.round(initialClosing).toLocaleString('th-TH')} ลิตร
                  </div>
                </div>
              </div>

              <div>
                <label className="field-label">หมายเหตุ</label>
                <input name="note" defaultValue={record.note ?? ''} className="field" />
              </div>

              {message && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{message}</div>}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
                  ยกเลิก
                </button>
                <button type="submit" disabled={isPending} className="btn-primary">
                  {isPending ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
