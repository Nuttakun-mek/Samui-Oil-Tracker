'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, ClipboardPenLine, History, Menu, Settings, X } from 'lucide-react';
import { useState } from 'react';
import type { AppPageId } from '@/lib/auth/page-access';
import { LogoutButton } from '@/components/logout-button';

type NavItem = {
  id: AppPageId;
  href: `/${AppPageId}`;
  label: string;
};

interface AppHeaderProps {
  email: string;
  navItems: NavItem[];
}

const NAV_ICONS = {
  dashboard: BarChart3,
  entry: ClipboardPenLine,
  history: History,
  settings: Settings,
} as const;

export function AppHeader({ email, navItems }: AppHeaderProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950 text-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex min-h-16 items-center justify-between gap-3">
          <Link href="/dashboard" className="min-w-0 py-2" onClick={() => setIsOpen(false)}>
            <div className="text-xs font-bold uppercase tracking-wide text-teal-300">PEA Oil Tracker</div>
            <h1 className="truncate text-sm font-extrabold sm:text-base">ระบบติดตามน้ำมันเชื้อเพลิง 3 พื้นที่</h1>
            <p className="hidden text-xs text-slate-400 lg:block">บ้านพังกา · ลิปะน้อย · โรงจักรเกาะเต่า</p>
          </Link>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <span className="max-w-52 truncate rounded-md bg-white/5 px-3 py-2 text-xs text-slate-300">{email}</span>
            <LogoutButton />
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/15 text-slate-200 hover:bg-white/10 md:hidden"
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
          <div id="mobile-navigation" className="border-t border-slate-800 py-3 md:hidden">
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
                      active ? 'bg-teal-700 text-white' : 'text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <Icon size={18} aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-800 pt-3">
              <span className="min-w-0 truncate text-xs text-slate-400">{email}</span>
              <LogoutButton />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
