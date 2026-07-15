import type { Metadata } from 'next';
import './globals.css';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/app-header';
import { APP_NAV_ITEMS, canAccessPage, normalizeRole } from '@/lib/auth/page-access';

export const metadata: Metadata = {
  title: 'ระบบติดตามการใช้น้ำมัน 3 พื้นที่ | PEA',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };
  const role = normalizeRole(profile?.role);
  const navItems = APP_NAV_ITEMS.filter((item) => canAccessPage(role, item.id));

  return (
    <html lang="th">
      <body suppressHydrationWarning>
        {user && <AppHeader email={user.email ?? 'ผู้ใช้งาน'} navItems={navItems} />}
        <main className={user ? 'mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:py-8' : ''}>{children}</main>
      </body>
    </html>
  );
}
