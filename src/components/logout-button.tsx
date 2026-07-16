'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="btn-secondary !min-h-8 !border-white/25 !bg-transparent !px-3 !py-1.5 !text-xs !text-white !shadow-none hover:!border-gold-200 hover:!bg-white/10"
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
      }}
    >
      ออกจากระบบ
    </button>
  );
}
