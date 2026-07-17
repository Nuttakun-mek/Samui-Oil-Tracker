'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Station } from '@/lib/types/domain';
import { updateStationSettings } from './actions';

export function StationSettingsForm({ station, isAdmin }: { station: Station; isAdmin: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      const result = await updateStationSettings(formData);
      setIsSuccess(result.ok);
      setMessage(result.ok ? 'บันทึกแล้ว' : result.error);
      if (result.ok) setTimeout(() => setMessage(null), 3000);
    });
  };

  return (
    <form onSubmit={onSubmit} className="panel space-y-3">
      <input type="hidden" name="id" value={station.id} />
      <h4 className="text-sm font-extrabold leading-5 text-slate-950">{station.name}</h4>
      <div>
        <label className="field-label">ความจุถังสำรอง (ลิตร)</label>
        <input name="tank_capacity_liters" type="number" defaultValue={station.tank_capacity_liters} className="field" disabled={!isAdmin} />
      </div>
      <div>
        <label className="field-label">แจ้งเตือนเมื่อเหลือใช้ได้น้อยกว่า (วัน)</label>
        <input name="low_stock_days" type="number" defaultValue={station.low_stock_days} className="field" disabled={!isAdmin} />
      </div>
      <div>
        <label className="field-label">Safety Stock (ลิตร)</label>
        <input name="safety_stock_liters" type="number" min="0" step="1" defaultValue={station.safety_stock_liters ?? 0} className="field" disabled={!isAdmin} />
        <p className="mt-1 text-xs text-slate-500">
          ปริมาณขั้นต่ำที่ต้องกันสำรองไว้เสมอ — &ldquo;คาดว่าใช้ได้อีกกี่วัน&rdquo; จะนับถึงจุดนี้ ไม่ใช่ถังหมด และเตือนวิกฤตทันทีเมื่อคงเหลือต่ำกว่า
        </p>
      </div>
      <div>
        <label className="field-label">ราคาน้ำมันต่อลิตร (บาท)</label>
        <input name="fuel_price_per_liter" type="number" min="0" step="0.01" defaultValue={station.fuel_price_per_liter} className="field" disabled={!isAdmin} />
        <p className="mt-1 text-xs text-slate-500">ใช้คูณยอดจ่ายออกเพื่อแสดงงบประมาณโดยประมาณ</p>
      </div>
      {isAdmin && (
        <div className="flex items-center gap-2.5">
          <button type="submit" disabled={isPending} className="btn-primary w-full sm:w-auto">
            {isPending ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
          {message && (
            <span className={`inline-flex items-center gap-1 text-xs font-bold ${isSuccess ? 'text-brand-700' : 'text-red-600'}`}>
              {isSuccess && <CheckCircle2 size={14} aria-hidden="true" />}
              {message}
            </span>
          )}
        </div>
      )}
    </form>
  );
}
