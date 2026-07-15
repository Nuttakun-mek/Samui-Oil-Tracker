'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { computeClosing, fuelRecordFormSchema, type FuelRecordFormValues } from '@/lib/types/domain';
import { requireAdmin, requirePageAccess } from '@/lib/auth/server';

export async function upsertFuelRecord(raw: FuelRecordFormValues) {
  await requirePageAccess('entry');

  const parsed = fuelRecordFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  }
  const values = parsed.data;

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return { ok: false as const, error: 'ไม่ได้เข้าสู่ระบบ' };

  const dispatched_liters =
    values.station_id === 'koh_tao'
      ? (values.dispatched_namsaeng ?? 0) + (values.dispatched_kfp ?? 0)
      : values.dispatched_liters;

  const closing_liters = computeClosing(values);

  const { error } = await supabase
    .from('fuel_records')
    .upsert(
      {
        station_id: values.station_id,
        record_date: values.record_date,
        opening_liters: values.opening_liters,
        received_liters: values.received_liters,
        plan_received_liters: values.plan_received_liters ?? 0,
        dispatched_liters,
        dispatched_namsaeng: values.station_id === 'koh_tao' ? values.dispatched_namsaeng : null,
        dispatched_kfp: values.station_id === 'koh_tao' ? values.dispatched_kfp : null,
        closing_liters,
        employee_code: values.employee_code,
        record_source: 'manual',
        source_file_name: null,
        source_note: 'daily_entry',
        note: values.note ?? null,
        created_by: uid,
        updated_by: uid,
      },
      { onConflict: 'station_id,record_date' }
    );

  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/dashboard');
  revalidatePath('/entry');
  revalidatePath('/history');
  return { ok: true as const };
}

export async function deleteFuelRecord(id: string) {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from('fuel_records').delete().eq('id', id);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/dashboard');
  revalidatePath('/entry');
  revalidatePath('/history');
  return { ok: true as const };
}

export async function updateFuelRecord(id: string, raw: FuelRecordFormValues) {
  await requirePageAccess('history');

  const parsed = fuelRecordFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  }
  const values = parsed.data;

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return { ok: false as const, error: 'ไม่ได้เข้าสู่ระบบ' };

  const dispatched_liters =
    values.station_id === 'koh_tao'
      ? (values.dispatched_namsaeng ?? 0) + (values.dispatched_kfp ?? 0)
      : values.dispatched_liters;
  const closing_liters = computeClosing(values);

  const { error } = await supabase
    .from('fuel_records')
    .update({
      station_id: values.station_id,
      record_date: values.record_date,
      opening_liters: values.opening_liters,
      received_liters: values.received_liters,
      plan_received_liters: values.plan_received_liters ?? 0,
      dispatched_liters,
      dispatched_namsaeng: values.station_id === 'koh_tao' ? values.dispatched_namsaeng : null,
      dispatched_kfp: values.station_id === 'koh_tao' ? values.dispatched_kfp : null,
      closing_liters,
      employee_code: values.employee_code,
      note: values.note ?? null,
      updated_by: uid,
    })
    .eq('id', id);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/dashboard');
  revalidatePath('/entry');
  revalidatePath('/history');
  return { ok: true as const };
}

// ดึงยอดคงเหลือของวันก่อนหน้า เพื่อ autofill ช่อง "ยอดยกมา"
export async function getPreviousClosing(stationId: string, beforeDate: string) {
  await requirePageAccess('entry');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('fuel_records')
    .select('closing_liters')
    .eq('station_id', stationId)
    .lt('record_date', beforeDate)
    .order('record_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return 0;
  return data.closing_liters as number;
}
