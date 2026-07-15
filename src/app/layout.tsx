import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { createClient } from '@/lib/supabase/server';
import { LogoutButton } from '@/components/logout-button';

export const metadata: Metadata = {
  title: 'ระบบติดตามการใช้น้ำมัน 3 เกาะ | PEA',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="th">
      <body>
        {user && (
          <header className="bg-navy text-white px-6 pt-4">
            <div className="flex items-end justify-between flex-wrap gap-3 pb-3">
              <div>
                <h1 className="text-base font-bold">ระบบติดตามการใช้น้ำมันเชื้อเพลิง 3 เกาะ</h1>
                <p className="text-xs text-blue-200 mt-0.5">การไฟฟ้าส่วนภูมิภาค · สมุย · พะงัน (ลิปะน้อย) · เกาะเต่า</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-blue-200">{user.email}</span>
                <LogoutButton />
              </div>
            </div>
            <nav className="flex gap-1 text-sm font-semibold">
              <Link href="/dashboard" className="nav-tab">
                แดชบอร์ด
              </Link>
              <Link href="/entry" className="nav-tab">
                บันทึกข้อมูลรายวัน
              </Link>
              <Link href="/history" className="nav-tab">
                ประวัติข้อมูล
              </Link>
              <Link href="/settings" className="nav-tab">
                ตั้งค่า
              </Link>
            </nav>
          </header>
        )}
        <main className="max-w-6xl mx-auto px-6 py-7">{children}</main>
      </body>
    </html>
  );
}
