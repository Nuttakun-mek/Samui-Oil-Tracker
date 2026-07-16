'use client';

import { useState, useTransition } from 'react';
import { STATION_IDS, STATION_LABEL, type StationId } from '@/lib/types/domain';
import type { UserRole } from '@/lib/auth/page-access';
import { createMember } from './actions';

export function AddMemberForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>('viewer');
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const result = await createMember(formData);
      if (result.ok) {
        setMessage(`สร้างสมาชิก ${result.email} เรียบร้อย`);
        form.reset();
        setRole('viewer');
      } else {
        setMessage(result.error);
      }
    });
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-extrabold text-slate-950">เพิ่มสมาชิกเข้าระบบ</h2>
        <p className="text-sm text-slate-600">สร้างบัญชี Supabase Auth พร้อมกำหนด role และสถานีที่เข้าถึงได้</p>
      </div>

      <form onSubmit={onSubmit} className="panel space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">ชื่อผู้ใช้</label>
            <input name="full_name" type="text" className="field" placeholder="เช่น เจ้าหน้าที่บ้านพังกา" />
          </div>
          <div>
            <label className="field-label">อีเมล</label>
            <input name="email" type="email" required className="field" placeholder="name@example.com" />
          </div>
          <div>
            <label className="field-label">รหัสผ่านเริ่มต้น</label>
            <input name="password" type="password" required minLength={8} className="field" />
          </div>
          <div>
            <label className="field-label">Role</label>
            <select name="role" value={role} onChange={(event) => setRole(event.target.value as UserRole)} className="field">
              <option value="viewer">viewer — ดูและส่งออกได้อย่างเดียว</option>
              <option value="editor">editor — แก้ไข/บันทึกข้อมูลได้</option>
              <option value="admin">admin — สิทธิ์เต็ม</option>
            </select>
          </div>
        </div>

        <div>
          <div className="field-label">สถานีที่เข้าถึงได้</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {STATION_IDS.map((stationId: StationId) => (
              <label key={stationId} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="station_ids"
                  value={stationId}
                  defaultChecked={role === 'admin'}
                  disabled={role === 'admin'}
                  className="h-4 w-4 accent-brand-600 disabled:opacity-60"
                />
                <span>{STATION_LABEL[stationId]}</span>
              </label>
            ))}
          </div>
          {role === 'admin' && <p className="mt-2 text-xs text-slate-500">admin เข้าถึงทุกสถานีโดยอัตโนมัติ</p>}
        </div>

        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? 'กำลังสร้างสมาชิก...' : 'สร้างสมาชิก'}
        </button>

        {message && <pre className="whitespace-pre-wrap rounded-lg bg-slate-950 px-3 py-2 text-xs text-white">{message}</pre>}
      </form>
    </section>
  );
}
