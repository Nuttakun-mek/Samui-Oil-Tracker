import type { Metadata } from 'next';
import './globals.css';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/app-header';
import { AppFooter } from '@/components/app-footer';
import { APP_NAV_ITEMS, canAccessPage, normalizeRole } from '@/lib/auth/page-access';

export const metadata: Metadata = {
  title: 'ระบบติดตามการใช้เชื้อเพลิงในพื้นที่เกาะสมุย เกาะพะงัน และเกาะเต่า | Island Oil Tracker',
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
        {user ? (
          <div className="flex min-h-screen flex-col">
            <AppHeader email={user.email ?? 'ผู้ใช้งาน'} navItems={navItems} />
            <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
            <AppFooter />
          </div>
        ) : children}
      </body>
    </html>
  );
}
