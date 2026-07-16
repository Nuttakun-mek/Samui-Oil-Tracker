import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { type AppPageId, canAccessPage, defaultLandingPath, normalizeRole } from './page-access';
import { STATION_IDS, type StationId } from '@/lib/types/domain';

export async function getCurrentUserAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = normalizeRole(profile?.role);

  if (role === 'admin') {
    return { user, role, stationIds: [...STATION_IDS] as StationId[] };
  }

  const { data: stationAccess } = await supabase
    .from('profile_station_access')
    .select('station_id')
    .eq('profile_id', user.id);
  const stationIds = (stationAccess ?? [])
    .map((item) => item.station_id)
    .filter((stationId): stationId is StationId => STATION_IDS.includes(stationId as StationId));

  return { user, role, stationIds };
}

export async function getCurrentUserRole() {
  return (await getCurrentUserAccess()).role;
}

export async function requireStationAccess(stationId: StationId) {
  const access = await getCurrentUserAccess();
  if (!access.stationIds.includes(stationId)) {
    throw new Error('บัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลของพื้นที่ที่เลือก');
  }
  return access;
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
