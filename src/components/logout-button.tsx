'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  return (
    <button
      className={`btn-secondary !min-h-9 !border-white/25 !bg-transparent !py-1.5 !text-xs !text-white !shadow-none hover:!border-gold-200 hover:!bg-white/10 ${compact ? '!w-9 !px-0' : '!px-3'}`}
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
      }}
    >
      <LogOut size={15} aria-hidden="true" />
      <span className={compact ? 'sr-only' : ''}>ออกจากระบบ</span>
    </button>
  );
}
