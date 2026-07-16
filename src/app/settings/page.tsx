import { createClient } from '@/lib/supabase/server';
import { STATION_LABEL, type Station, type StationId } from '@/lib/types/domain';
import { APP_NAV_ITEMS, canAccessPage, normalizeRole, type UserRole } from '@/lib/auth/page-access';
import { updateStationSettings, updateUserPermissions } from './actions';
import { OPERATIONAL_DATA_TABLES, type OperationalDataCounts } from './reset-data-config';
import { requirePageAccess } from '@/lib/auth/server';
import { ImportRecordsPanel } from './import-records-panel';
import { AddMemberForm } from './add-member-form';
import { DatabaseExportImportPanel } from './database-export-import-panel';
import { ResetDataPanel } from './reset-data-panel';

export const revalidate = 0;

export default async function SettingsPage() {
  await requirePageAccess('settings');

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
  const accessByProfile = new Map<string, Set<string>>();

  for (const access of stationAccess ?? []) {
    const profileId = access.profile_id as string;
    const stationId = access.station_id as string;
    const current = accessByProfile.get(profileId) ?? new Set<string>();
    current.add(stationId);
    accessByProfile.set(profileId, current);
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
          <a href="#station-settings" className="chip whitespace-nowrap">สถานี</a>
          <a href="#data-reset" className="chip whitespace-nowrap">ล้างข้อมูล</a>
          <a href="#spreadsheet-import" className="chip whitespace-nowrap">นำเข้า Excel</a>
          <a href="#database-import" className="chip whitespace-nowrap">นำเข้าฐานข้อมูล</a>
          <a href="#members" className="chip whitespace-nowrap">สมาชิก</a>
          <a href="#permissions" className="chip whitespace-nowrap">สิทธิ์ผู้ใช้</a>
        </nav>
      )}

      <section id="station-settings" className="scroll-mt-32 space-y-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-950">ตั้งค่าสถานี</h2>
          <p className="text-sm text-slate-600">กำหนดความจุถัง เกณฑ์เฝ้าระวัง และราคาต่อลิตรสำหรับประมาณการงบประมาณ</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((st) => (
            <form key={st.id} action={updateStationSettings} className="panel space-y-3">
              <input type="hidden" name="id" value={st.id} />
              <h4 className="text-sm font-extrabold leading-5 text-slate-950">{st.name}</h4>
              <div>
                <label className="field-label">ความจุถังสำรอง (ลิตร)</label>
                <input
                  name="tank_capacity_liters"
                  type="number"
                  defaultValue={st.tank_capacity_liters}
                  className="field"
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <label className="field-label">แจ้งเตือนเมื่อเหลือใช้ได้น้อยกว่า (วัน)</label>
                <input
                  name="low_stock_days"
                  type="number"
                  defaultValue={st.low_stock_days}
                  className="field"
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <label className="field-label">ราคาน้ำมันต่อลิตร (บาท)</label>
                <input
                  name="fuel_price_per_liter"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={st.fuel_price_per_liter}
                  className="field"
                  disabled={!isAdmin}
                />
                <p className="mt-1 text-xs text-slate-500">ใช้คูณยอดจ่ายออกเพื่อแสดงงบประมาณโดยประมาณ</p>
              </div>
              {isAdmin && (
                <button type="submit" className="btn-primary w-full sm:w-auto">
                  บันทึก
                </button>
              )}
            </form>
          ))}
        </div>
      </section>

      {isAdmin && (
        <ResetDataPanel initialCounts={operationalCounts} />
      )}

      {isAdmin && (
        <div id="spreadsheet-import" className="scroll-mt-32">
          <ImportRecordsPanel />
        </div>
      )}

      {isAdmin && (
        <div id="database-import" className="scroll-mt-32">
          <DatabaseExportImportPanel />
        </div>
      )}

      {isAdmin && (
        <div id="members" className="scroll-mt-32">
          <AddMemberForm />
        </div>
      )}

      {isAdmin && (
        <section id="permissions" className="scroll-mt-32 space-y-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">จัดการสิทธิ์ผู้ใช้</h2>
            <p className="text-sm text-slate-600">กำหนด role, หน้าที่เข้าได้ และสถานีที่ผู้ใช้ field อ่าน/บันทึกได้</p>
          </div>

          <div className="grid gap-3 lg:hidden">
            {profileList.length === 0 && (
              <div className="panel py-10 text-center text-sm text-slate-500">ไม่พบผู้ใช้</div>
            )}
            {profileList.map((profile) => {
              const role = normalizeRole(profile.role);
              const access = accessByProfile.get(profile.id) ?? new Set<string>();

              return (
                <article key={profile.id} className="panel space-y-3">
                  <div>
                    <div className="text-sm font-extrabold text-slate-950">{profile.full_name || 'ยังไม่ระบุชื่อ'}</div>
                    <div className="mt-1 break-all text-xs text-slate-500">{profile.id}</div>
                  </div>

                  <form id={`permission-mobile-${profile.id}`} action={updateUserPermissions} className="space-y-3">
                    <input type="hidden" name="profile_id" value={profile.id} />
                    <div>
                      <label className="field-label">Role</label>
                      <select name="role" defaultValue={role} className="field">
                        <option value="field">field</option>
                        <option value="admin">admin</option>
                      </select>
                    </div>
                  </form>

                  <div>
                    <div className="field-label">สิทธิ์เข้าหน้า</div>
                    <div className="flex flex-wrap gap-1.5">
                      {APP_NAV_ITEMS.map((item) => (
                        <span
                          key={item.id}
                          className={`chip !px-2.5 !py-1 !text-xs ${
                            canAccessPage(role, item.id) ? 'chip-active' : 'opacity-40'
                          }`}
                        >
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="field-label">สถานี</div>
                    <div className="grid gap-2">
                      {list.map((station) => (
                        <label key={station.id} className="inline-flex items-start gap-2 text-sm">
                          <input
                            form={`permission-mobile-${profile.id}`}
                            type="checkbox"
                            name="station_ids"
                            value={station.id}
                            defaultChecked={role === 'admin' || access.has(station.id)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
                          />
                          <span className="leading-5">{STATION_LABEL[station.id as StationId] ?? station.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <button form={`permission-mobile-${profile.id}`} type="submit" className="btn-primary w-full">
                    บันทึกสิทธิ์
                  </button>
                </article>
              );
            })}
          </div>

          <div className="table-shell hidden lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="text-left px-3.5 py-2.5">ผู้ใช้</th>
                  <th className="text-left px-3.5 py-2.5">Role</th>
                  <th className="text-left px-3.5 py-2.5">สิทธิ์เข้าหน้า</th>
                  <th className="text-left px-3.5 py-2.5">สถานี</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {profileList.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-500">
                      ไม่พบผู้ใช้
                    </td>
                  </tr>
                )}
                {profileList.map((profile) => {
                  const role = normalizeRole(profile.role);
                  const access = accessByProfile.get(profile.id) ?? new Set<string>();

                  return (
                    <tr key={profile.id} className="border-b border-slate-200 last:border-0 align-top hover:bg-slate-50">
                      <td className="px-3.5 py-3 min-w-56">
                        <div className="font-bold text-slate-950">{profile.full_name || 'ยังไม่ระบุชื่อ'}</div>
                        <div className="text-xs text-slate-500 tabular-nums break-all">{profile.id}</div>
                      </td>
                      <td className="px-3.5 py-3">
                        <form id={`permission-${profile.id}`} action={updateUserPermissions} className="space-y-3">
                          <input type="hidden" name="profile_id" value={profile.id} />
                          <select name="role" defaultValue={role} className="field min-w-28">
                            <option value="field">field</option>
                            <option value="admin">admin</option>
                          </select>
                        </form>
                      </td>
                      <td className="px-3.5 py-3 min-w-52">
                        <div className="flex flex-wrap gap-1.5">
                          {APP_NAV_ITEMS.map((item) => (
                            <span
                              key={item.id}
                              className={`chip !px-2.5 !py-1 !text-xs ${
                                canAccessPage(role, item.id) ? 'chip-active' : 'opacity-40'
                              }`}
                            >
                              {item.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 min-w-64">
                        <div className="grid gap-2">
                          {list.map((station) => (
                            <label key={station.id} className="inline-flex items-center gap-2 text-sm">
                              <input
                                form={`permission-${profile.id}`}
                                type="checkbox"
                                name="station_ids"
                                value={station.id}
                                defaultChecked={role === 'admin' || access.has(station.id)}
                                className="h-4 w-4 accent-brand-600"
                              />
                              <span>{STATION_LABEL[station.id as StationId] ?? station.name}</span>
                            </label>
                          ))}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 text-right">
                        <button form={`permission-${profile.id}`} type="submit" className="btn-primary whitespace-nowrap">
                          บันทึกสิทธิ์
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
