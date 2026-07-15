'use client';

import { createBrowserClient } from '@supabase/ssr';

// Browser-side Supabase client — ใช้ใน Client Components (เช่น realtime subscription)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
