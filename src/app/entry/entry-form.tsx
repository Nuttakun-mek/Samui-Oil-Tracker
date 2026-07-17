'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Paperclip } from 'lucide-react';
import { STATION_LABEL, computeClosing, fuelRecordFormSchema, type FuelRecordFormValues, type Station } from '@/lib/types/domain';
import { DatePicker } from '@/components/ui/date-picker';
import { uploadRecordDocument } from '../documents/actions';
import { upsertFuelRecord, getPreviousClosing } from './actions';

const today = () => new Date().toISOString().slice(0, 10);

export default function EntryForm({ stations }: { stations: Station[] }) {
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [previousDate, setPreviousDate] = useState<string | null>(null);
  const [previousSameDay, setPreviousSameDay] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const defaultStationId = stations[0]?.id ?? 'samui';

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    control,
    formState: { errors },
  } = useForm<FuelRecordFormValues>({
    resolver: zodResolver(fuelRecordFormSchema),
    defaultValues: {
      station_id: defaultStationId,
      record_date: today(),
      opening_liters: 0,
      received_liters: 0,
      plan_received_liters: 0,
      dispatched_liters: 0,
      employee_code: '',
      vehicle_plate: '',
      reference_document_no: '',
      contract_code: '',
      confirmed: false,
    },
  });

  const station = watch('station_id');
  const isTao = station === 'koh_tao';
  const opening = watch('opening_liters') || 0;
  const received = watch('received_liters') || 0;
  const dispatched = watch('dispatched_liters') || 0;
  const namsaeng = watch('dispatched_namsaeng') || 0;
  const kfp = watch('dispatched_kfp') || 0;
  const recordDate = watch('record_date');

  // autofill "ยอดยกมา" จากยอดคงเหลือล่าสุด (รวมเที่ยวก่อนหน้าของวันเดียวกัน)
  const refreshOpening = useCallback(() => {
    if (!station || !recordDate) return;
    getPreviousClosing(station, recordDate).then((previous) => {
      setValue('opening_liters', previous.closing);
      setPreviousDate(previous.recordDate);
      setPreviousSameDay(previous.sameDay);
    });
  }, [station, recordDate, setValue]);

  useEffect(() => {
    refreshOpening();
  }, [refreshOpening]);

  const closing = computeClosing({
    station_id: station,
    opening_liters: opening,
    received_liters: received,
    dispatched_liters: dispatched,
    dispatched_namsaeng: namsaeng,
    dispatched_kfp: kfp,
  });
  const selectedStation = stations.find((item) => item.id === station);
  const capacity = selectedStation?.tank_capacity_liters ?? 0;
  const exceedsCapacity = capacity > 0 && closing > capacity;
  const invalidClosing = closing < 0 || exceedsCapacity;

  const onSubmit = (values: FuelRecordFormValues) => {
    startTransition(async () => {
      const res = await upsertFuelRecord(values);
      if (res.ok) {
        let attachmentNote = '';
        if (attachments.length) {
          let uploaded = 0;
          const failures: string[] = [];
          for (const file of attachments) {
            const formData = new FormData();
            formData.append('file', file);
            const uploadResult = await uploadRecordDocument(res.recordId, formData);
            if (uploadResult.ok) uploaded += 1;
            else failures.push(`${file.name}: ${uploadResult.error}`);
          }
          attachmentNote = failures.length
            ? ` — แนบเอกสารได้ ${uploaded}/${attachments.length} ไฟล์ (${failures[0]})`
            : ` พร้อมเอกสารแนบ ${uploaded} ไฟล์`;
          setAttachments([]);
          if (attachmentInputRef.current) attachmentInputRef.current.value = '';
        }
        setToast(`บันทึกข้อมูล ${STATION_LABEL[values.station_id]} วันที่ ${values.record_date} เรียบร้อย${attachmentNote}`);
        reset({
          ...values,
          received_liters: 0,
          dispatched_liters: 0,
          dispatched_namsaeng: 0,
          dispatched_kfp: 0,
          vehicle_plate: '',
          reference_document_no: '',
          contract_code: '',
          note: '',
          confirmed: false,
        });
        // เที่ยวถัดไปของวันเดียวกันต้องยกยอดต่อจากรายการที่เพิ่งบันทึก
        refreshOpening();
      } else {
        setToast(`เกิดข้อผิดพลาด: ${res.error}`);
      }
      setTimeout(() => setToast(null), 3000);
    });
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <div className="page-kicker">Daily Entry</div>
        <h1 className="page-title">บันทึกการใช้น้ำมันรายวัน</h1>
        <p className="page-subtitle">กรอกยอดใช้น้ำมันประจำวันพร้อมรหัสพนักงานผู้รายงาน เพื่อให้ตรวจสอบย้อนหลังได้ครบถ้วน</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="panel space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">พื้นที่ / สถานี</label>
            {stations.length === 1 ? (
              <>
                <input type="hidden" {...register('station_id')} />
                <div className="field bg-slate-50 text-slate-700" aria-label="พื้นที่ตามสิทธิ์ของบัญชี">
                  {STATION_LABEL[stations[0].id]}
                </div>
                <p className="mt-1 text-xs font-semibold text-brand-700">ล็อกตามสิทธิ์ของบัญชีผู้ใช้</p>
              </>
            ) : (
              <select {...register('station_id')} className="field">
                {stations.map(({ id }) => (
                  <option key={id} value={id}>
                    {STATION_LABEL[id]}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="field-label">วันที่</label>
            <Controller
              control={control}
              name="record_date"
              render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} />}
            />
          </div>
        </div>

        <div>
          <label className="field-label">รหัสพนักงานผู้รายงาน</label>
          <input
            type="text"
            {...register('employee_code')}
            className="field"
            placeholder="เช่น 123456"
            autoComplete="off"
          />
          {errors.employee_code && <p className="mt-1 text-xs font-semibold text-red-600">{errors.employee_code.message}</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label flex items-center justify-between gap-2">
              <span>ยอดยกมา (ลิตร)</span>
              <span className="text-xs font-normal text-slate-500">อัตโนมัติ</span>
            </label>
            <input type="number" step="0.1" {...register('opening_liters')} className="field" />
            <p className="mt-1 text-xs text-slate-500">
              {previousDate
                ? previousSameDay
                  ? 'ยกยอดต่อจากเที่ยวล่าสุดของวันเดียวกัน'
                  : `จากยอดปิดวันที่ ${previousDate}`
                : 'ไม่พบยอดปิดก่อนหน้า'}
            </p>
          </div>
          <div>
            <label className="field-label">รับน้ำมันจริง (ลิตร)</label>
            <input type="number" step="0.1" {...register('received_liters')} className="field" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">แผนรับน้ำมัน (ลิตร)</label>
            <input type="number" step="0.1" {...register('plan_received_liters')} className="field" />
          </div>
          {!isTao && (
            <div>
              <label className="field-label">ยอดจ่ายน้ำมันรวม (ลิตร)</label>
              <input type="number" step="0.1" {...register('dispatched_liters')} className="field" />
            </div>
          )}
        </div>

        {isTao && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">จ่ายน้ำมันนำแสง (ลิตร)</label>
              <input type="number" step="0.1" {...register('dispatched_namsaeng')} className="field" />
            </div>
            <div>
              <label className="field-label">จ่ายน้ำมันเครื่อง กฟภ. (ลิตร)</label>
              <input type="number" step="0.1" {...register('dispatched_kfp')} className="field" />
            </div>
          </div>
        )}
        {errors.dispatched_namsaeng && <p className="text-xs text-red-600">{errors.dispatched_namsaeng.message}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            <div className="font-bold text-slate-800">ยอดใช้น้ำมันวันนี้</div>
            <div className="mt-1 text-2xl font-extrabold text-amber-800 tabular-nums">
              {Math.round(station === 'koh_tao' ? namsaeng + kfp : dispatched).toLocaleString('th-TH')} ลิตร
            </div>
          </div>
          <div className={`rounded-lg border px-4 py-3 text-sm ${invalidClosing ? 'border-red-200 bg-red-50' : 'border-brand-200 bg-brand-50'}`}>
            <div className="font-bold text-slate-800">ยอดคงเหลือคำนวณอัตโนมัติ</div>
            <div className={`mt-1 text-2xl font-extrabold tabular-nums ${invalidClosing ? 'text-red-800' : 'text-brand-800'}`}>
              {Math.round(closing).toLocaleString('th-TH')} ลิตร
            </div>
            <div className="mt-1 text-xs text-slate-600">
              ความจุถัง {Math.round(capacity).toLocaleString('th-TH')} ลิตร
              {closing < 0 ? ' - ยอดติดลบ' : exceedsCapacity ? ' - เกินความจุถัง' : ''}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="field-label">ทะเบียนรถส่งน้ำมัน</label>
            <input type="text" {...register('vehicle_plate')} className="field" placeholder="ถ้ามี" />
          </div>
          <div>
            <label className="field-label">เลขใบส่งของ / PO</label>
            <input type="text" {...register('reference_document_no')} className="field" placeholder="ถ้ามี" />
          </div>
          <div>
            <label className="field-label">รหัสสัญญา</label>
            <input type="text" {...register('contract_code')} className="field" placeholder="เช่น ช.034/2569" />
          </div>
        </div>

        <div>
          <label className="field-label">
            หมายเหตุ <span className="text-xs font-normal text-slate-500">เช่น เหตุการณ์ผิดปกติ หรือรายละเอียดประกอบ</span>
          </label>
          <input type="text" {...register('note')} className="field" />
        </div>

        <div>
          <label className="field-label flex items-center gap-1.5">
            <Paperclip size={13} aria-hidden="true" />
            แนบเอกสาร <span className="text-xs font-normal text-slate-500">ใบส่งน้ำมัน รูปถ่าย ฯลฯ (PDF / รูปภาพ ไม่เกิน 10 MB ต่อไฟล์)</span>
          </label>
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(event) => setAttachments(Array.from(event.target.files ?? []))}
            className="field !py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-brand-700"
          />
          {attachments.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              จะอัปโหลด {attachments.length.toLocaleString('th-TH')} ไฟล์หลังบันทึกสำเร็จ: {attachments.map((file) => file.name).join(', ')}
            </p>
          )}
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
          <input type="checkbox" {...register('confirmed')} className="mt-0.5 h-4 w-4 accent-brand-700" />
          <span>ตรวจสอบพื้นที่ วันที่ ยอดรับ ยอดจ่าย และยอดคงเหลือแล้ว</span>
        </label>
        {errors.confirmed && <p className="text-xs font-semibold text-red-600">{errors.confirmed.message}</p>}

        <button type="submit" disabled={isPending || invalidClosing || stations.length === 0} className="btn-primary w-full sm:w-auto">
          {isPending ? 'กำลังบันทึก...' : 'บันทึกการใช้น้ำมัน'}
        </button>
      </form>

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    </div>
  );
}
