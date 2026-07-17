import type { Metadata } from 'next';
import './globals.css';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/app-header';
import { AppFooter } from '@/components/app-footer';
import { MaintenanceBanner } from '@/components/maintenance-banner';
import { getMaintenanceState } from '@/lib/maintenance';
import { APP_NAV_ITEMS, canAccessPage, normalizeRole } from '@/lib/auth/page-access';

export const metadata: Metadata = {
  title: 'ระบบติดตามการใช้เชื้อเพลิงในพื้นที่เกาะสมุยและเกาะเต่า | Island Oil Tracker',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle()
    : { data: null };
  const role = normalizeRole(profile?.role);
  const navItems = APP_NAV_ITEMS.filter((item) => canAccessPage(role, item.id));
  const maintenance = user ? await getMaintenanceState() : { enabled: false, message: null };

  return (
    <html lang="th">
      <body suppressHydrationWarning>
        {user ? (
          <div className="flex min-h-screen flex-col">
            <AppHeader
              displayName={profile?.full_name || user.email || 'ผู้ใช้งาน'}
              email={user.email ?? ''}
              role={role}
              navItems={navItems}
            />
            {maintenance.enabled && <MaintenanceBanner message={maintenance.message} isAdmin={role === 'admin'} />}
            <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
            <AppFooter />
          </div>
        ) : children}
      </body>
    </html>
  );
}
