'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, ClipboardPenLine, FileText, History, Menu, Settings, X } from 'lucide-react';
import { useState } from 'react';
import type { AppPageId, UserRole } from '@/lib/auth/page-access';
import { LogoutButton } from '@/components/logout-button';

type NavItem = {
  id: AppPageId;
  href: `/${AppPageId}`;
  label: string;
};

interface AppHeaderProps {
  displayName: string;
  email: string;
  role: UserRole;
  navItems: NavItem[];
}

const NAV_ICONS = {
  dashboard: BarChart3,
  entry: ClipboardPenLine,
  history: History,
  reports: FileText,
  settings: Settings,
} as const;

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'ผู้ดูแลระบบ',
  editor: 'ผู้บันทึกข้อมูล',
  viewer: 'ผู้ใช้งานทั่วไป',
};

export function AppHeader({ displayName, email, role, navItems }: AppHeaderProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-brand-800 bg-brand-700 text-white shadow-[0_4px_16px_rgba(49,9,35,0.16)]">
      <div className="h-1 bg-gold-500" />
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 items-center justify-between gap-3">
          <Link href="/dashboard" className="min-w-0 py-2" onClick={() => setIsOpen(false)}>
            <h1 className="line-clamp-2 text-sm font-extrabold leading-5 sm:text-base lg:truncate">
              ระบบติดตามการใช้เชื้อเพลิงในพื้นที่เกาะสมุย เกาะพะงัน และเกาะเต่า
            </h1>
            <div className="mt-0.5 text-[11px] font-bold tracking-wide text-gold-200">Island Oil Tracker</div>
          </Link>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <div className="max-w-60 rounded-md border border-white/10 bg-white/10 px-3 py-1.5 text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span className="truncate text-xs font-bold text-white">{displayName}</span>
                <span className="shrink-0 rounded bg-gold-500/20 px-1.5 py-0.5 text-[10px] font-bold text-gold-200">{ROLE_LABEL[role]}</span>
              </div>
              {email && email !== displayName && <div className="truncate text-[10px] text-white/60">{email}</div>}
            </div>
            <LogoutButton />
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/20 text-white hover:bg-white/10 md:hidden"
            onClick={() => setIsOpen((current) => !current)}
            aria-expanded={isOpen}
            aria-controls="mobile-navigation"
            aria-label={isOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
          >
            {isOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="-mb-px hidden gap-1 md:flex" aria-label="เมนูหลัก">
          {navItems.map((item) => {
            const Icon = NAV_ICONS[item.id];
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.id} href={item.href} className={`nav-tab ${active ? 'nav-tab-active' : ''}`}>
                <Icon size={16} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {isOpen && (
          <div id="mobile-navigation" className="border-t border-white/15 py-3 md:hidden">
            <nav className="grid gap-1" aria-label="เมนูหลักบนมือถือ">
              {navItems.map((item) => {
                const Icon = NAV_ICONS[item.id];
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-bold ${
                      active ? 'bg-white text-brand-700 shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon size={18} aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/15 pt-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-bold text-white">{displayName}</span>
                  <span className="shrink-0 rounded bg-gold-500/20 px-1.5 py-0.5 text-[10px] font-bold text-gold-200">{ROLE_LABEL[role]}</span>
                </div>
                {email && email !== displayName && <span className="block truncate text-[10px] text-white/60">{email}</span>}
              </div>
              <LogoutButton />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
