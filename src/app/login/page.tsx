'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_420px] lg:items-center">
          <section className="space-y-5">
            <div>
              <div className="page-kicker !text-teal-300">PEA Oil Tracker</div>
              <h1 className="mt-2 max-w-xl text-3xl font-extrabold leading-tight sm:text-4xl">
                ระบบติดตามน้ำมันเชื้อเพลิง 3 เกาะ
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                ติดตามยอดรับ-จ่าย คงเหลือรายวัน และสถานะความเสี่ยงของสถานีไฟฟ้าสมุย 1 พื้นที่ลิปะน้อย และโรงจักรเกาะเต่าในหน้าจอเดียว
              </p>
            </div>
            <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="font-bold text-white">Stock</div>
                <div>คงเหลือล่าสุด</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="font-bold text-white">Entry</div>
                <div>บันทึกประจำวัน</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="font-bold text-white">Access</div>
                <div>สิทธิ์ตามพื้นที่</div>
              </div>
            </div>
          </section>

          <form onSubmit={onSubmit} className="rounded-lg border border-white/10 bg-white p-5 text-slate-900 shadow-xl">
            <div className="mb-5">
              <h2 className="text-lg font-extrabold text-slate-950">เข้าสู่ระบบ</h2>
              <p className="mt-1 text-xs text-slate-500">บัญชีผู้ใช้สร้างโดยผู้ดูแลระบบเท่านั้น</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="field-label">อีเมล</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
              </div>
              <div>
                <label className="field-label">รหัสผ่าน</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field"
                />
              </div>
              {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
