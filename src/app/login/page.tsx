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
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <form onSubmit={onSubmit} className="panel w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-lg font-bold text-navy">ระบบติดตามการใช้น้ำมัน 3 เกาะ</h1>
          <p className="text-xs text-muted mt-1">การไฟฟ้าส่วนภูมิภาค · สมุย · พะงัน · เกาะเต่า</p>
        </div>
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
        <p className="text-xs text-muted">บัญชีผู้ใช้สร้างโดยผู้ดูแลระบบผ่าน Supabase Auth เท่านั้น (ไม่มีสมัครเอง)</p>
      </form>
    </div>
  );
}
