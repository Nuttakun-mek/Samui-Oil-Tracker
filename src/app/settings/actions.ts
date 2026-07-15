'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function updateStationSettings(formData: FormData) {
  const id = formData.get('id') as string;
  const tank_capacity_liters = Number(formData.get('tank_capacity_liters'));
  const low_stock_days = Number(formData.get('low_stock_days'));

  const supabase = await createClient();
  // RLS (stations_write) จะปฏิเสธถ้าไม่ใช่ admin — ไม่ต้องเช็ค role ซ้ำในโค้ดฝั่งนี้
  await supabase.from('stations').update({ tank_capacity_liters, low_stock_days }).eq('id', id);

  revalidatePath('/settings');
  revalidatePath('/dashboard');
}
