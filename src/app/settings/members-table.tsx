'use client';

import { useMemo, useState, useTransition } from 'react';
import { Ban, CheckCircle2, KeyRound, Search, ShieldCheck } from 'lucide-react';
import { STATION_LABEL, type Station, type StationId } from '@/lib/types/domain';
import { APP_NAV_ITEMS, canAccessPage, normalizeRole, type UserRole } from '@/lib/auth/page-access';
import { PasswordInput } from '@/components/ui/password-input';
import { resetMemberPassword, setMemberActive, updateUserPermissions } from './actions';

export interface MemberRow {
  id: string;
  full_name: string | null;
  role: UserRole;
  email: string | null;
  lastSignInAt: string | null;
  active: boolean;
  createdAt: string;
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

function PasswordResetControl({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary !min-h-8 !px-2.5 !text-xs">
        <KeyRound size={13} aria-hidden="true" />
        รีเซ็ตรหัสผ่าน
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <PasswordInput
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="รหัสผ่านใหม่ (8+ ตัว)"
          minLength={8}
          className="!h-8 !py-1 !pr-8 !text-xs"
        />
        <button
          type="button"
          disabled={isPending || password.length < 8}
          onClick={() =>
            startTransition(async () => {
              const result = await resetMemberPassword(profileId, password);
              setMessage(result.ok ? 'ตั้งรหัสผ่านใหม่แล้ว' : result.error);
              if (result.ok) {
                setPassword('');
                setOpen(false);
              }
            })
          }
          className="btn-primary !min-h-8 !px-2.5 !text-xs"
        >
          บันทึก
        </button>
      </div>
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}

function ActiveToggleControl({ profileId, active, isSelf }: { profileId: string; active: boolean; isSelf: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={isPending || (isSelf && active)}
        title={isSelf && active ? 'ไม่สามารถปิดใช้งานบัญชีของตัวเองได้' : undefined}
        onClick={() => {
          if (active && !window.confirm('ปิดใช้งานบัญชีนี้? ผู้ใช้จะเข้าสู่ระบบไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง')) return;
          startTransition(async () => {
            const result = await setMemberActive(profileId, !active);
            setMessage(result.ok ? null : result.error);
          });
        }}
        className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold ${
          active ? 'border border-slate-300 text-slate-700 hover:bg-slate-50' : 'border border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {active ? <Ban size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
        {active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
      </button>
      {message && <p className="text-xs text-red-600">{message}</p>}
    </div>
  );
}

export function MembersTable({
  members,
  stations,
  accessByProfile,
  currentUserId,
}: {
  members: MemberRow[];
  stations: Station[];
  accessByProfile: Record<string, string[]>;
  currentUserId: string;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (member) => (member.full_name ?? '').toLowerCase().includes(q) || (member.email ?? '').toLowerCase().includes(q)
    );
  }, [members, query]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ค้นหาชื่อหรืออีเมล..."
          className="field !pl-8"
          aria-label="ค้นหาสมาชิก"
        />
      </div>

      <div className="grid gap-3 lg:hidden">
        {filtered.length === 0 && <div className="panel py-10 text-center text-sm text-slate-500">ไม่พบผู้ใช้</div>}
        {filtered.map((member) => {
          const role = normalizeRole(member.role);
          const access = new Set(accessByProfile[member.id] ?? []);

          return (
            <article key={member.id} className="panel space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-slate-950">{member.full_name || 'ยังไม่ระบุชื่อ'}</div>
                  <div className="truncate text-xs text-slate-600">{member.email || member.id}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">เข้าระบบล่าสุด {formatDateTime(member.lastSignInAt)}</div>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-bold ${member.active ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-700'}`}>
                  {member.active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                </span>
              </div>

              <form id={`permission-mobile-${member.id}`} action={updateUserPermissions} className="space-y-3">
                <input type="hidden" name="profile_id" value={member.id} />
                <div>
                  <label className="field-label">Role</label>
                  <select name="role" defaultValue={role} className="field">
                    <option value="viewer">viewer — ดูอย่างเดียว</option>
                    <option value="editor">editor — แก้ไขได้</option>
                    <option value="admin">admin — สิทธิ์เต็ม</option>
                  </select>
                </div>
              </form>

              <div>
                <div className="field-label">สิทธิ์เข้าหน้า</div>
                <div className="flex flex-wrap gap-1.5">
                  {APP_NAV_ITEMS.map((item) => (
                    <span key={item.id} className={`chip !px-2.5 !py-1 !text-xs ${canAccessPage(role, item.id) ? 'chip-active' : 'opacity-40'}`}>
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="field-label">สถานี</div>
                <div className="grid gap-2">
                  {stations.map((station) => (
                    <label key={station.id} className="inline-flex items-start gap-2 text-sm">
                      <input
                        form={`permission-mobile-${member.id}`}
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

              <button form={`permission-mobile-${member.id}`} type="submit" className="btn-primary w-full">
                บันทึกสิทธิ์
              </button>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <PasswordResetControl profileId={member.id} />
                <ActiveToggleControl profileId={member.id} active={member.active} isSelf={member.id === currentUserId} />
              </div>
            </article>
          );
        })}
      </div>

      <div className="table-shell hidden lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="table-header">
              <th className="text-left px-3.5 py-2.5">ผู้ใช้</th>
              <th className="text-left px-3.5 py-2.5">สถานะ</th>
              <th className="text-left px-3.5 py-2.5">Role</th>
              <th className="text-left px-3.5 py-2.5">สิทธิ์เข้าหน้า</th>
              <th className="text-left px-3.5 py-2.5">สถานี</th>
              <th className="text-left px-3.5 py-2.5">จัดการบัญชี</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-500">
                  ไม่พบผู้ใช้
                </td>
              </tr>
            )}
            {filtered.map((member) => {
              const role = normalizeRole(member.role);
              const access = new Set(accessByProfile[member.id] ?? []);

              return (
                <tr key={member.id} className="border-b border-slate-200 last:border-0 align-top hover:bg-slate-50">
                  <td className="px-3.5 py-3 min-w-56">
                    <div className="font-bold text-slate-950">{member.full_name || 'ยังไม่ระบุชื่อ'}</div>
                    <div className="text-xs text-slate-600">{member.email || member.id}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">เข้าระบบล่าสุด {formatDateTime(member.lastSignInAt)}</div>
                  </td>
                  <td className="px-3.5 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold ${member.active ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-700'}`}>
                      {member.active ? <ShieldCheck size={12} aria-hidden="true" /> : <Ban size={12} aria-hidden="true" />}
                      {member.active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="px-3.5 py-3">
                    <form id={`permission-${member.id}`} action={updateUserPermissions} className="space-y-3">
                      <input type="hidden" name="profile_id" value={member.id} />
                      <select name="role" defaultValue={role} className="field min-w-28">
                        <option value="viewer">viewer</option>
                        <option value="editor">editor</option>
                        <option value="admin">admin</option>
                      </select>
                    </form>
                  </td>
                  <td className="px-3.5 py-3 min-w-52">
                    <div className="flex flex-wrap gap-1.5">
                      {APP_NAV_ITEMS.map((item) => (
                        <span key={item.id} className={`chip !px-2.5 !py-1 !text-xs ${canAccessPage(role, item.id) ? 'chip-active' : 'opacity-40'}`}>
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3.5 py-3 min-w-64">
                    <div className="grid gap-2">
                      {stations.map((station) => (
                        <label key={station.id} className="inline-flex items-center gap-2 text-sm">
                          <input
                            form={`permission-${member.id}`}
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
                  <td className="px-3.5 py-3 min-w-40">
                    <div className="flex flex-col items-start gap-2">
                      <PasswordResetControl profileId={member.id} />
                      <ActiveToggleControl profileId={member.id} active={member.active} isSelf={member.id === currentUserId} />
                    </div>
                  </td>
                  <td className="px-3.5 py-3 text-right">
                    <button form={`permission-${member.id}`} type="submit" className="btn-primary whitespace-nowrap">
                      บันทึกสิทธิ์
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
