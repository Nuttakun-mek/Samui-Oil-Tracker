'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeClosing, fuelRecordFormSchema, type FuelRecordFormValues } from '@/lib/types/domain';
import { getCurrentUserAccess, requireAdmin, requirePageAccess } from '@/lib/auth/server';

export async function upsertFuelRecord(raw: FuelRecordFormValues) {
  await requirePageAccess('entry');

  const parsed = fuelRecordFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  }
  const values = parsed.data;
  const access = await getCurrentUserAccess();
  if (access.role === 'viewer') {
    return { ok: false as const, error: 'บัญชีนี้มีสิทธิ์ดูอย่างเดียว ไม่สามารถบันทึกข้อมูลได้' };
  }
  if (!access.stationIds.includes(values.station_id)) {
    return { ok: false as const, error: 'บัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลของพื้นที่ที่เลือก' };
  }

  const supabase = await createClient();
  const uid = access.user.id;

  const dispatched_liters =
    values.station_id === 'koh_tao'
      ? (values.dispatched_namsaeng ?? 0) + (values.dispatched_kfp ?? 0)
      : values.dispatched_liters;

  const closing_liters = computeClosing(values);
  const { data: station } = await supabase
    .from('stations')
    .select('tank_capacity_liters')
    .eq('id', values.station_id)
    .single();
  if (closing_liters < 0) return { ok: false as const, error: 'ยอดคงเหลือติดลบ กรุณาตรวจยอดจ่าย' };
  if (station && closing_liters > Number(station.tank_capacity_liters)) {
    return { ok: false as const, error: 'ยอดคงเหลือเกินความจุถังของพื้นที่นี้' };
  }

  const { data: saved, error } = await supabase
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
        vehicle_plate: values.vehicle_plate || null,
        reference_document_no: values.reference_document_no || null,
        contract_code: values.contract_code || null,
        record_source: 'manual',
        source_file_name: null,
        source_note: 'daily_entry',
        note: values.note ?? null,
        created_by: uid,
        updated_by: uid,
      },
      { onConflict: 'station_id,record_date' }
    )
    .select('id')
    .single();

  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/dashboard');
  revalidatePath('/entry');
  revalidatePath('/history');
  return { ok: true as const, recordId: saved.id as string };
}

export async function deleteFuelRecord(id: string) {
  await requireAdmin();

  const supabase = await createClient();

  // ลบไฟล์เอกสารแนบใน storage ก่อน — FK cascade ลบได้เฉพาะแถว metadata ไม่ลบไฟล์จริง
  const { data: documents } = await supabase.from('fuel_record_documents').select('file_path').eq('record_id', id);
  if (documents?.length) {
    try {
      const admin = createAdminClient();
      await admin.storage.from('fuel-documents').remove(documents.map((doc) => doc.file_path as string));
    } catch {
      // ไม่มี service key: ยอมให้ไฟล์ค้างใน storage ดีกว่า block การลบ record
    }
  }

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
  const access = await getCurrentUserAccess();
  if (access.role === 'viewer') {
    return { ok: false as const, error: 'บัญชีนี้มีสิทธิ์ดูอย่างเดียว ไม่สามารถแก้ไขข้อมูลได้' };
  }
  if (!access.stationIds.includes(values.station_id)) {
    return { ok: false as const, error: 'บัญชีนี้ไม่มีสิทธิ์แก้ไขข้อมูลของพื้นที่ที่เลือก' };
  }

  const supabase = await createClient();
  const uid = access.user.id;

  const dispatched_liters =
    values.station_id === 'koh_tao'
      ? (values.dispatched_namsaeng ?? 0) + (values.dispatched_kfp ?? 0)
      : values.dispatched_liters;
  const closing_liters = computeClosing(values);
  const { data: station } = await supabase
    .from('stations')
    .select('tank_capacity_liters')
    .eq('id', values.station_id)
    .single();
  if (closing_liters < 0) return { ok: false as const, error: 'ยอดคงเหลือติดลบ กรุณาตรวจยอดจ่าย' };
  if (station && closing_liters > Number(station.tank_capacity_liters)) {
    return { ok: false as const, error: 'ยอดคงเหลือเกินความจุถังของพื้นที่นี้' };
  }

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
      vehicle_plate: values.vehicle_plate || null,
      reference_document_no: values.reference_document_no || null,
      contract_code: values.contract_code || null,
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

  const access = await getCurrentUserAccess();
  if (!access.stationIds.includes(stationId as FuelRecordFormValues['station_id'])) {
    return { closing: 0, recordDate: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('fuel_records')
    .select('closing_liters, record_date')
    .eq('station_id', stationId)
    .lt('record_date', beforeDate)
    .order('record_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return { closing: 0, recordDate: null };
  return { closing: Number(data.closing_liters), recordDate: data.record_date as string };
}
