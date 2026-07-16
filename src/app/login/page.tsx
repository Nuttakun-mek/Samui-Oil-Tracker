'use client';

import { useState } from 'react';
import { Building2, LockKeyhole, Phone, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { APP_RELEASE } from '@/lib/app-version';
import { PasswordInput } from '@/components/ui/password-input';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setLoading(false);
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      return;
    }
    // hard navigation แทน router.push+refresh — รับประกันว่า cookie session ใหม่ถูกใช้ทันที
    // ไม่ต้องรอ client router timing (สาเหตุที่ Enter/คลิกเข้าระบบเคยรู้สึกหน่วง)
    window.location.href = '/dashboard';
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="grid min-h-screen lg:grid-cols-[minmax(340px,0.8fr)_minmax(520px,1.2fr)]">
        <section className="relative flex min-h-64 flex-col justify-between overflow-hidden bg-brand-700 px-6 py-8 text-white sm:px-10 lg:min-h-screen lg:px-12 lg:py-12">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gold-500" />
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-md border border-white/20 bg-white/10">
              <Building2 size={24} aria-hidden="true" />
            </div>
            <h1 className="mt-8 max-w-md text-3xl font-extrabold !leading-snug sm:text-4xl">
              ระบบติดตามการใช้เชื้อเพลิงในพื้นที่เกาะสมุยและเกาะเต่า
            </h1>
            <p className="mt-3 text-xs font-extrabold tracking-wide text-gold-200">Island Oil Tracker</p>
          </div>

          <div className="mt-8 flex items-center gap-3 border-t border-white/15 pt-5 lg:mt-12">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-gold-200" aria-hidden="true" />
            <div>
              <p className="text-xs leading-5 text-white/50">แผนกแผนบริหารความต่อเนื่องทางธุรกิจ การไฟฟ้าส่วนภูมิภาค</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/50"><Phone size={12} aria-hidden="true" /> โทร. 9517</p>
              <p className="mt-1 font-mono text-[10px] text-white/50">{APP_RELEASE.environmentLabel} · {APP_RELEASE.label}</p>
            </div>
          </div>
        </section>

        <main className="flex items-center justify-center px-5 py-10 sm:px-10 lg:px-16">
          <form onSubmit={onSubmit} className="w-full max-w-md">
            <div className="mb-7">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                <LockKeyhole size={20} aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-2xl font-extrabold text-brand-900">เข้าสู่ระบบ</h2>
              <p className="mt-1 text-sm text-slate-500">ใช้บัญชีที่ได้รับอนุญาตจากผู้ดูแลระบบ</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="field-label" htmlFor="login-email">อีเมล</label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="login-password">รหัสผ่าน</label>
                <PasswordInput
                  id="login-password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  {error}
                </p>
              )}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
