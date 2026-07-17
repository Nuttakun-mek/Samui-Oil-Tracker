'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import {
  STATION_LABEL,
  computeClosing,
  type FuelRecord,
  type FuelRecordFormValues,
  type StationId,
} from '@/lib/types/domain';
import { formatThaiDateCompact } from '@/lib/format/thai-date';
import { DatePicker } from '@/components/ui/date-picker';
import { updateFuelRecord, updateFuelRecordWithCascade, previewRecordCascade, type CascadeRow } from '../entry/actions';

function toNumber(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function liters(value: number) {
  return Math.round(value).toLocaleString('th-TH');
}

export function EditRecordButton({
  record,
  allowedStationIds,
  locked = false,
}: {
  record: FuelRecord;
  allowedStationIds: StationId[];
  locked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recordDate, setRecordDate] = useState(record.record_date);
  const [isPending, startTransition] = useTransition();
  const [isPreviewing, startPreviewTransition] = useTransition();
  const [pendingValues, setPendingValues] = useState<FuelRecordFormValues | null>(null);
  const [cascadeRows, setCascadeRows] = useState<CascadeRow[] | null>(null);
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

  const valuesFromForm = (formData: FormData): FuelRecordFormValues => ({
    station_id: String(formData.get('station_id')) as StationId,
    record_date: String(formData.get('record_date') ?? ''),
    opening_liters: toNumber(formData.get('opening_liters')),
    received_liters: toNumber(formData.get('received_liters')),
    plan_received_liters: toNumber(formData.get('plan_received_liters')),
    dispatched_liters: toNumber(formData.get('dispatched_liters')),
    dispatched_namsaeng: toNumber(formData.get('dispatched_namsaeng')),
    dispatched_kfp: toNumber(formData.get('dispatched_kfp')),
    employee_code: String(formData.get('employee_code') ?? '').trim(),
    vehicle_plate: String(formData.get('vehicle_plate') ?? '').trim(),
    reference_document_no: String(formData.get('reference_document_no') ?? '').trim(),
    contract_code: String(formData.get('contract_code') ?? '').trim(),
    note: String(formData.get('note') ?? '').trim(),
    confirmed: true,
  });

  const closeAndReset = () => {
    setOpen(false);
    setCascadeRows(null);
    setPendingValues(null);
  };

  // ตรวจก่อนว่าการแก้ไขนี้กระทบรายการถัดไปหรือไม่ — ถ้ากระทบ แสดง preview ให้ยืนยันก่อน ไม่บันทึกเงียบๆ ทันที
  const onSubmit = (formData: FormData) => {
    setMessage(null);
    const values = valuesFromForm(formData);

    startPreviewTransition(async () => {
      const preview = await previewRecordCascade(record.id, values);
      if (!preview.ok) {
        // preview ทำไม่ได้ (เช่น สิทธิ์/ข้อมูลไม่ผ่าน) ให้ลองบันทึกตรงๆ เพื่อเห็น error ที่แท้จริง
        const result = await updateFuelRecord(record.id, values);
        if (result.ok) {
          closeAndReset();
          router.refresh();
        } else {
          setMessage(result.error);
        }
        return;
      }
      const affected = preview.downstream.filter((row) => Math.abs(row.newClosing - row.oldClosing) > 0.05 || Math.abs(row.newOpening - row.oldOpening) > 0.05);
      if (!affected.length) {
        startTransition(async () => {
          const result = await updateFuelRecord(record.id, values);
          if (result.ok) {
            closeAndReset();
            router.refresh();
          } else {
            setMessage(result.error);
          }
        });
        return;
      }
      setPendingValues(values);
      setCascadeRows(affected);
    });
  };

  const commitSaveOnly = () => {
    if (!pendingValues) return;
    startTransition(async () => {
      const result = await updateFuelRecord(record.id, pendingValues);
      if (result.ok) {
        closeAndReset();
        router.refresh();
      } else {
        setMessage(result.error);
      }
    });
  };

  const commitWithCascade = () => {
    if (!pendingValues) return;
    startTransition(async () => {
      const result = await updateFuelRecordWithCascade(record.id, pendingValues);
      if (result.ok) {
        closeAndReset();
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
        disabled={locked}
        title={locked ? 'ระบบกำลังปรับปรุง แก้ไขข้อมูลไม่ได้ชั่วคราว' : undefined}
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
      >
        แก้ไข
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-xl bg-white p-4 shadow-2xl sm:rounded-xl sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-950">{cascadeRows ? 'ยืนยันผลกระทบต่อรายการถัดไป' : 'แก้ไข record'}</h2>
                <p className="text-sm text-slate-500">
                  {cascadeRows ? 'การแก้ไขนี้จะเปลี่ยนยอดยกมา/คงเหลือของรายการถัดไปด้วย ตรวจสอบก่อนยืนยัน' : 'ปรับข้อมูลที่นำเข้าแล้ว และบันทึกกลับเข้าระบบ'}
                </p>
              </div>
              <button type="button" onClick={closeAndReset} className="btn-secondary px-3 py-1 text-sm">
                ปิด
              </button>
            </div>

            {cascadeRows ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <p>
                    พบ <strong>{cascadeRows.length} รายการ</strong> ที่ยอดยกมาต่อเนื่องจากรายการนี้ — เลือก
                    &ldquo;บันทึกและปรับปรุงต่อเนื่อง&rdquo; เพื่อไล่แก้ทั้งหมดให้ตรงกันอัตโนมัติ หรือ &ldquo;บันทึกเฉพาะรายการนี้&rdquo;
                    ถ้าความต่างของรายการถัดไปเป็นความตั้งใจ (เช่น วัดถังจริงแล้วเจอค่าคลาดเคลื่อน)
                  </p>
                </div>
                <div className="table-shell">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="table-header">
                        <th className="px-3 py-2 text-left">วันที่</th>
                        <th className="px-3 py-2 text-right">ยอดยกมา</th>
                        <th className="px-3 py-2 text-right">ยอดคงเหลือ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cascadeRows.map((row) => (
                        <tr key={row.id} className="border-t border-slate-200">
                          <td className="px-3 py-2 font-semibold text-slate-900">{formatThaiDateCompact(row.record_date)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <span className="text-slate-400 line-through">{liters(row.oldOpening)}</span>{' '}
                            <span className="font-bold text-emerald-700">{liters(row.newOpening)}</span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <span className="text-slate-400 line-through">{liters(row.oldClosing)}</span>{' '}
                            <span className="font-bold text-emerald-700">{liters(row.newClosing)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {message && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{message}</div>}

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setCascadeRows(null);
                      setPendingValues(null);
                    }}
                    className="btn-secondary"
                  >
                    ย้อนกลับไปแก้ไข
                  </button>
                  <button type="button" disabled={isPending} onClick={commitSaveOnly} className="btn-secondary">
                    {isPending ? 'กำลังบันทึก...' : 'บันทึกเฉพาะรายการนี้'}
                  </button>
                  <button type="button" disabled={isPending} onClick={commitWithCascade} className="btn-primary">
                    {isPending ? 'กำลังบันทึก...' : `บันทึกและปรับปรุงต่อเนื่อง (${cascadeRows.length} รายการ)`}
                  </button>
                </div>
              </div>
            ) : (
            <form action={onSubmit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="field-label">พื้นที่</label>
                  <select name="station_id" defaultValue={initialStation} className="field">
                    {allowedStationIds.map((stationId) => (
                      <option key={stationId} value={stationId}>
                        {STATION_LABEL[stationId]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">วันที่</label>
                  <input type="hidden" name="record_date" value={recordDate} />
                  <DatePicker value={recordDate} onChange={setRecordDate} />
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
                <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
                  <div className="text-xs font-bold text-brand-700">ยอดคงเหลือเดิมที่ระบบคำนวณ</div>
                  <div className="mt-1 text-xl font-extrabold text-brand-900 tabular-nums">
                    {Math.round(initialClosing).toLocaleString('th-TH')} ลิตร
                  </div>
                </div>
              </div>

              <div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="field-label">ทะเบียนรถ</label>
                    <input name="vehicle_plate" defaultValue={record.vehicle_plate ?? ''} className="field" />
                  </div>
                  <div>
                    <label className="field-label">เลขใบส่งของ / PO</label>
                    <input name="reference_document_no" defaultValue={record.reference_document_no ?? ''} className="field" />
                  </div>
                  <div>
                    <label className="field-label">รหัสสัญญา</label>
                    <input name="contract_code" defaultValue={record.contract_code ?? ''} className="field" />
                  </div>
                </div>
              </div>

              <div>
                <label className="field-label">หมายเหตุ</label>
                <input name="note" defaultValue={record.note ?? ''} className="field" />
              </div>

              {message && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{message}</div>}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => closeAndReset()} className="btn-secondary">
                  ยกเลิก
                </button>
                <button type="submit" disabled={isPreviewing || isPending} className="btn-primary">
                  {isPreviewing ? 'กำลังตรวจสอบผลกระทบ...' : isPending ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
