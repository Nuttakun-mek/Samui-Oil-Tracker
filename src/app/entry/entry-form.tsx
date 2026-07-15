'use client';

import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { STATION_IDS, STATION_LABEL, computeClosing, fuelRecordFormSchema, type FuelRecordFormValues } from '@/lib/types/domain';
import { upsertFuelRecord, getPreviousClosing } from './actions';

const today = () => new Date().toISOString().slice(0, 10);

export default function EntryPage() {
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FuelRecordFormValues>({
    resolver: zodResolver(fuelRecordFormSchema),
    defaultValues: {
      station_id: 'samui',
      record_date: today(),
      opening_liters: 0,
      received_liters: 0,
      plan_received_liters: 0,
      dispatched_liters: 0,
      employee_code: '',
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

  // autofill "ยอดยกมา" จากยอดคงเหลือวันก่อนหน้า
  useEffect(() => {
    if (!station || !recordDate) return;
    getPreviousClosing(station, recordDate).then((val) => setValue('opening_liters', val));
  }, [station, recordDate, setValue]);

  const closing = computeClosing({
    station_id: station,
    opening_liters: opening,
    received_liters: received,
    dispatched_liters: dispatched,
    dispatched_namsaeng: namsaeng,
    dispatched_kfp: kfp,
  });

  const onSubmit = (values: FuelRecordFormValues) => {
    startTransition(async () => {
      const res = await upsertFuelRecord(values);
      if (res.ok) {
        setToast(`บันทึกข้อมูล ${STATION_LABEL[values.station_id]} วันที่ ${values.record_date} เรียบร้อย`);
        reset({ ...values, received_liters: 0, dispatched_liters: 0, dispatched_namsaeng: 0, dispatched_kfp: 0, note: '' });
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
            <select {...register('station_id')} className="field">
              {STATION_IDS.map((id) => (
                <option key={id} value={id}>
                  {STATION_LABEL[id]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">วันที่</label>
            <input type="date" {...register('record_date')} className="field" />
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
          </div>
          <div>
            <label className="field-label">รับน้ำมันจริง (ลิตร)</label>
            <input type="number" step="0.1" {...register('received_liters')} className="field" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {!isTao && (
            <div>
              <label className="field-label">แผนรับน้ำมัน (ลิตร)</label>
              <input type="number" step="0.1" {...register('plan_received_liters')} className="field" />
            </div>
          )}
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
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm">
            <div className="font-bold text-slate-800">ยอดคงเหลือคำนวณอัตโนมัติ</div>
            <div className="mt-1 text-2xl font-extrabold text-teal-800 tabular-nums">
              {Math.round(closing).toLocaleString('th-TH')} ลิตร
            </div>
          </div>
        </div>

        <div>
          <label className="field-label">
            หมายเหตุ <span className="text-xs font-normal text-slate-500">เช่น ทะเบียนรถ, เลขที่ PO</span>
          </label>
          <input type="text" {...register('note')} className="field" />
        </div>

        <button type="submit" disabled={isPending} className="btn-primary w-full sm:w-auto">
          {isPending ? 'กำลังบันทึก...' : 'บันทึกการใช้น้ำมัน'}
        </button>
      </form>

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg">{toast}</div>}
    </div>
  );
}
