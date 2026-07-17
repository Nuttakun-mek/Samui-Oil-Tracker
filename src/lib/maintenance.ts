import { createClient } from '@/lib/supabase/server';

export interface MaintenanceState {
  enabled: boolean;
  message: string | null;
}

// อ่านสถานะโหมดกำลังปรับปรุง — ก่อนรัน migration 0020 คอลัมน์/ตารางยังไม่มี จึงต้อง fallback เป็นปิดเสมอ
// (ไม่ให้หน้าเว็บพังเพราะฟีเจอร์นี้ เป็น degrade-safe เหมือนแพทเทิร์นอื่นในโปรเจกต์)
export async function getMaintenanceState(): Promise<MaintenanceState> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('app_settings').select('maintenance_mode, maintenance_message').eq('id', true).single();
    if (error || !data) return { enabled: false, message: null };
    return { enabled: Boolean(data.maintenance_mode), message: (data.maintenance_message as string | null) ?? null };
  } catch {
    return { enabled: false, message: null };
  }
}
