'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeClosing, fuelRecordEntrySchema, fuelRecordFormSchema, type FuelRecordFormValues } from '@/lib/types/domain';
import { getCurrentUserAccess, requireAdmin, requirePageAccess } from '@/lib/auth/server';
import { getMaintenanceState } from '@/lib/maintenance';

export async function upsertFuelRecord(raw: FuelRecordFormValues) {
  await requirePageAccess('entry');

  // ฟอร์มรายวันใช้กติกาเข้ม (รหัสพนักงาน 6 หลัก, ข้อมูลรถ/ใบส่งของ/สัญญาบังคับเมื่อรับน้ำมัน)
  const parsed = fuelRecordEntrySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  }
  const values = parsed.data;
  const access = await getCurrentUserAccess();
  if (access.role === 'viewer') {
    return { ok: false as const, error: 'บัญชีนี้มีสิทธิ์ดูอย่างเดียว ไม่สามารถบันทึกข้อมูลได้' };
  }
  if (access.role !== 'admin' && (await getMaintenanceState()).enabled) {
    return { ok: false as const, error: 'ระบบกำลังปรับปรุง ไม่สามารถบันทึกข้อมูลได้ชั่วคราว กรุณาลองใหม่อีกครั้งภายหลัง' };
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

  // insert เสมอ — 1 วันส่งน้ำมันได้หลายเที่ยว แต่ละเที่ยวเป็น record แยก (migration 0018)
  const { data: saved, error } = await supabase
    .from('fuel_records')
    .insert({
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
    })
    .select('id')
    .single();

  if (error) {
    const message =
      error.code === '23505'
        ? 'ฐานข้อมูลยังจำกัด 1 รายการต่อวัน — ต้องรัน migration 0018 ก่อนจึงบันทึกหลายเที่ยวต่อวันได้'
        : error.message;
    return { ok: false as const, error: message };
  }

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
  if (access.role !== 'admin' && (await getMaintenanceState()).enabled) {
    return { ok: false as const, error: 'ระบบกำลังปรับปรุง ไม่สามารถแก้ไขข้อมูลได้ชั่วคราว กรุณาลองใหม่อีกครั้งภายหลัง' };
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

// ดึงยอดคงเหลือล่าสุด (รวมรายการอื่นของวันเดียวกัน) เพื่อ autofill ช่อง "ยอดยกมา"
// — ถ้าวันนี้บันทึกเที่ยวแรกไปแล้ว เที่ยวถัดไปจะยกยอดต่อจากเที่ยวล่าสุดของวันนี้ทันที
export async function getPreviousClosing(stationId: string, beforeDate: string) {
  await requirePageAccess('entry');

  const access = await getCurrentUserAccess();
  if (!access.stationIds.includes(stationId as FuelRecordFormValues['station_id'])) {
    return { closing: 0, recordDate: null, sameDay: false };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('fuel_records')
    .select('closing_liters, record_date')
    .eq('station_id', stationId)
    .lte('record_date', beforeDate)
    .order('record_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return { closing: 0, recordDate: null, sameDay: false };
  return {
    closing: Number(data.closing_liters),
    recordDate: data.record_date as string,
    sameDay: data.record_date === beforeDate,
  };
}
