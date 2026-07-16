import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { STATION_LABEL, type Station } from '@/lib/types/domain';
import type { UserRole } from '@/lib/auth/page-access';
import { StationSettingsForm } from './station-settings-form';
import { OPERATIONAL_DATA_TABLES, type OperationalDataCounts } from './reset-data-config';
import { requirePageAccess } from '@/lib/auth/server';
import { ImportRecordsPanel } from './import-records-panel';
import { AddMemberForm } from './add-member-form';
import { DatabaseExportImportPanel } from './database-export-import-panel';
import { ResetDataPanel } from './reset-data-panel';
import { MembersTable, type MemberRow } from './members-table';
import { ProcurementPanel } from './procurement-panel';
import { getProcurementSummary } from '@/lib/procurement';

export const revalidate = 0;

type SettingsTab = 'stations' | 'procurement' | 'reset' | 'import-excel' | 'import-db' | 'members' | 'audit';
const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'stations', label: 'สถานี' },
  { id: 'procurement', label: 'จัดซื้อล๊อตใหญ่' },
  { id: 'reset', label: 'ล้างข้อมูล' },
  { id: 'import-excel', label: 'นำเข้า Excel' },
  { id: 'import-db', label: 'นำเข้าฐานข้อมูล' },
  { id: 'members', label: 'สมาชิกและสิทธิ์' },
  { id: 'audit', label: 'ประวัติการเปลี่ยนสิทธิ์' },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePageAccess('settings');

  const { tab: rawTab } = await searchParams;
  const tab: SettingsTab = TABS.some((item) => item.id === rawTab) ? (rawTab as SettingsTab) : 'stations';

  const supabase = await createClient();
  const [{ data: stations }, { data: profiles }, { data: stationAccess }, countEntries] = await Promise.all([
    supabase.from('stations').select('*').order('id'),
    supabase.from('profiles').select('id, full_name, role, created_at').order('created_at', { ascending: true }),
    supabase.from('profile_station_access').select('profile_id, station_id'),
    Promise.all(
      OPERATIONAL_DATA_TABLES.map(async (table) => {
        const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
        return [table, error ? null : (count ?? 0)] as const;
      })
    ),
  ]);
  const operationalCounts = Object.fromEntries(countEntries) as OperationalDataCounts;
  const list = (stations ?? []) as Station[];
  const profileList = (profiles ?? []) as Array<{
    id: string;
    full_name: string | null;
    role: UserRole;
    created_at: string;
  }>;
  const accessByProfile: Record<string, string[]> = {};

  for (const access of stationAccess ?? []) {
    const profileId = access.profile_id as string;
    const stationId = access.station_id as string;
    accessByProfile[profileId] = [...(accessByProfile[profileId] ?? []), stationId];
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user?.id ?? '')
    .single();
  const isAdmin = profile?.role === 'admin';
  const procurementSummary = isAdmin ? await getProcurementSummary() : null;

  let members: MemberRow[] = profileList.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    role: p.role,
    email: null,
    lastSignInAt: null,
    active: true,
    createdAt: p.created_at,
  }));
  let auditRows: Array<{
    id: number;
    target_profile_id: string;
    changed_by: string | null;
    action: string;
    previous_role: string | null;
    new_role: string | null;
    previous_station_ids: string[] | null;
    new_station_ids: string[] | null;
    changed_at: string;
  }> = [];
  let adminToolsError: string | null = null;

  if (isAdmin) {
    try {
      const admin = createAdminClient();
      const authDetails = await Promise.all(
        profileList.map(async (p) => {
          const { data } = await admin.auth.admin.getUserById(p.id);
          return [p.id, data.user] as const;
        })
      );
      const authByProfile = new Map(authDetails);
      members = profileList.map((p) => {
        const authUser = authByProfile.get(p.id);
        const bannedUntil = authUser?.banned_until ? new Date(authUser.banned_until) : null;
        return {
          id: p.id,
          full_name: p.full_name,
          role: p.role,
          email: authUser?.email ?? null,
          lastSignInAt: authUser?.last_sign_in_at ?? null,
          active: !bannedUntil || bannedUntil.getTime() <= Date.now(),
          createdAt: p.created_at,
        };
      });

      const { data: audit } = await admin
        .from('permission_audit')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(100);
      auditRows = audit ?? [];
    } catch {
      adminToolsError = 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน .env.local จึงแสดงอีเมล/ประวัติสิทธิ์ไม่ได้ (แก้ไข role/สถานีได้ตามปกติ)';
    }
  }

  const profileNameById = new Map(profileList.map((p) => [p.id, p.full_name || p.id.slice(0, 8)]));

  return (
    <div className="w-full space-y-7">
      <div>
        <div className="page-kicker">Administration</div>
        <h1 className="page-title">ตั้งค่าระบบ</h1>
        <p className="page-subtitle">
          จัดการความจุถัง เกณฑ์แจ้งเตือน การนำเข้าข้อมูล และสิทธิ์ผู้ใช้
          {!isAdmin && ' — เฉพาะผู้ดูแลระบบ (admin) เท่านั้นที่แก้ไขได้ (RLS บังคับที่ database)'}
        </p>
      </div>

      {isAdmin && (
        <nav
          className="sticky top-[68px] z-30 -mx-4 flex gap-1 overflow-x-auto border-y border-slate-200 bg-[#F7F7F9]/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 md:top-[113px]"
          aria-label="หมวดการตั้งค่า"
        >
          {TABS.map((item) => (
            <Link
              key={item.id}
              href={`/settings?tab=${item.id}`}
              className={`chip whitespace-nowrap ${tab === item.id ? 'chip-active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      {isAdmin && adminToolsError && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-800">
          {adminToolsError}
        </div>
      )}

      {tab === 'stations' && (
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-950">ตั้งค่าสถานี</h2>
          <p className="text-sm text-slate-600">กำหนดความจุถัง เกณฑ์เฝ้าระวัง และราคาต่อลิตรสำหรับประมาณการงบประมาณ</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((st) => (
            <StationSettingsForm key={st.id} station={st} isAdmin={isAdmin} />
          ))}
        </div>
      </section>
      )}

      {isAdmin && tab === 'procurement' && procurementSummary && (
        <ProcurementPanel summary={procurementSummary} />
      )}

      {isAdmin && tab === 'reset' && (
        <ResetDataPanel initialCounts={operationalCounts} />
      )}

      {isAdmin && tab === 'import-excel' && (
        <div>
          <ImportRecordsPanel />
        </div>
      )}

      {isAdmin && tab === 'import-db' && (
        <div>
          <DatabaseExportImportPanel />
        </div>
      )}

      {isAdmin && tab === 'members' && (
        <div className="space-y-5">
          <AddMemberForm />

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">จัดการสมาชิกและสิทธิ์</h2>
              <p className="text-sm text-slate-600">ค้นหาสมาชิก กำหนด role, หน้าที่เข้าได้, สถานีที่เข้าถึงได้, รีเซ็ตรหัสผ่าน หรือปิดใช้งานบัญชี</p>
            </div>
            <MembersTable members={members} stations={list} accessByProfile={accessByProfile} currentUserId={user?.id ?? ''} />
          </section>
        </div>
      )}

      {isAdmin && tab === 'audit' && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">ประวัติการเปลี่ยนสิทธิ์</h2>
            <p className="text-sm text-slate-600">บันทึกทุกครั้งที่มีการสร้างสมาชิกหรือเปลี่ยน role/สถานีที่เข้าถึงได้ — ตรวจสอบย้อนหลังได้ว่าใครแก้ไขอะไรเมื่อไหร่</p>
          </div>
          <div className="table-shell">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="text-left px-3.5 py-2.5">เวลา</th>
                  <th className="text-left px-3.5 py-2.5">สมาชิก</th>
                  <th className="text-left px-3.5 py-2.5">แก้ไขโดย</th>
                  <th className="text-left px-3.5 py-2.5">การเปลี่ยนแปลง</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-slate-500">
                      ยังไม่มีประวัติการเปลี่ยนสิทธิ์
                    </td>
                  </tr>
                )}
                {auditRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-200 last:border-0 align-top hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3.5 py-3 tabular-nums">{new Date(row.changed_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className="px-3.5 py-3 font-semibold">{profileNameById.get(row.target_profile_id) ?? row.target_profile_id}</td>
                    <td className="px-3.5 py-3">{row.changed_by ? profileNameById.get(row.changed_by) ?? row.changed_by : '-'}</td>
                    <td className="px-3.5 py-3">
                      {row.action === 'created' ? (
                        <span>สร้างสมาชิกใหม่ role <strong>{row.new_role}</strong> · สถานี {(row.new_station_ids ?? []).map((id) => STATION_LABEL[id as keyof typeof STATION_LABEL] ?? id).join(', ') || '-'}</span>
                      ) : (
                        <span>
                          role {row.previous_role ?? '-'} → <strong>{row.new_role}</strong>
                          <br />
                          สถานี {(row.previous_station_ids ?? []).map((id) => STATION_LABEL[id as keyof typeof STATION_LABEL] ?? id).join(', ') || '-'} → {(row.new_station_ids ?? []).map((id) => STATION_LABEL[id as keyof typeof STATION_LABEL] ?? id).join(', ') || '-'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
