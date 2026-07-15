import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { type AppPageId, canAccessPage, defaultLandingPath, normalizeRole } from './page-access';

export async function getCurrentUserRole() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return normalizeRole(profile?.role);
}

export async function requirePageAccess(page: AppPageId) {
  const role = await getCurrentUserRole();

  if (!canAccessPage(role, page)) {
    redirect(defaultLandingPath(role));
  }

  return role;
}

export async function requireAdmin() {
  const role = await getCurrentUserRole();

  if (role !== 'admin') {
    redirect(defaultLandingPath(role));
  }

  return role;
}
