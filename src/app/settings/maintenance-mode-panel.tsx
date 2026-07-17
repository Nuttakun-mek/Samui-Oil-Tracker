'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Wrench } from 'lucide-react';
import { setMaintenanceMode } from './actions';

export function MaintenanceModePanel({ enabled, message }: { enabled: boolean; message: string | null }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFeedback(null);
    startTransition(async () => {
      const result = await setMaintenanceMode(formData);
      setIsSuccess(result.ok);
      setFeedback(result.ok ? 'บันทึกแล้ว' : (result.error ?? 'เกิดข้อผิดพลาด'));
      if (result.ok) {
        router.refresh();
        setTimeout(() => setFeedback(null), 3000);
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className={`panel space-y-3 border-l-4 ${enabled ? 'border-l-amber-500 bg-amber-50/40' : 'border-l-slate-300'}`}>
      <div className="flex items-center gap-2">
        <Wrench size={18} className="text-amber-700" aria-hidden="true" />
        <h3 className="text-sm font-extrabold text-slate-950">โหมดกำลังปรับปรุงระบบ</h3>
      </div>
      <p className="text-xs text-slate-500">
        เปิดก่อนสั่ง deploy — ผู้ใช้ทั่วไปจะเห็นแบนเนอร์แจ้งเตือนทุกหน้า และปุ่มบันทึก/แก้ไขข้อมูลจะถูกปิดชั่วคราว
        (บัญชีผู้ดูแลระบบไม่ถูกปิดกั้น) อย่าลืมปิดหลัง deploy เสร็จ
      </p>
      <label className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
        <input type="checkbox" name="maintenance_mode" defaultChecked={enabled} className="h-4 w-4 accent-amber-600" />
        เปิดใช้งานตอนนี้
      </label>
      <div>
        <label className="field-label">ข้อความแจ้งผู้ใช้ (ไม่บังคับ)</label>
        <input
          name="maintenance_message"
          type="text"
          defaultValue={message ?? ''}
          placeholder="เช่น ระบบจะกลับมาใช้งานได้ในอีก 10 นาที"
          className="field"
        />
      </div>
      <div className="flex items-center gap-2.5">
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
        {feedback && (
          <span className={`inline-flex items-center gap-1 text-xs font-bold ${isSuccess ? 'text-brand-700' : 'text-red-600'}`}>
            {isSuccess && <CheckCircle2 size={14} aria-hidden="true" />}
            {feedback}
          </span>
        )}
      </div>
    </form>
  );
}
