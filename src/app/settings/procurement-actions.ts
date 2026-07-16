'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/server';
import { PROCUREMENT_GROUP_IDS, type ProcurementGroupId } from '@/lib/procurement';

function isProcurementGroupId(value: string): value is ProcurementGroupId {
  return (PROCUREMENT_GROUP_IDS as readonly string[]).includes(value);
}

export async function setGroupBaseline(formData: FormData) {
  await requireAdmin();

  const group = formData.get('procurement_group') as string;
  const baseline_liters = Number(formData.get('baseline_liters'));
  const baseline_date = formData.get('baseline_date') as string;
  const warn_below_liters = Number(formData.get('warn_below_liters'));
  const note = (formData.get('note') as string)?.trim() || null;

  if (!isProcurementGroupId(group)) {
    return { ok: false as const, error: 'ไม่พบกลุ่มจัดซื้อที่เลือก' };
  }
  if (!Number.isFinite(baseline_liters) || baseline_liters < 0) {
    return { ok: false as const, error: 'ยอดคงเหลือเริ่มต้นต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' };
  }
  if (!baseline_date) {
    return { ok: false as const, error: 'กรุณาเลือกวันที่อ้างอิงยอดเริ่มต้น' };
  }
  if (!Number.isFinite(warn_below_liters) || warn_below_liters < 0) {
    return { ok: false as const, error: 'เกณฑ์แจ้งเตือนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from('fuel_group_baseline').upsert(
    {
      procurement_group: group,
      baseline_liters,
      baseline_date,
      warn_below_liters,
      note,
      set_by: user?.id ?? null,
      set_at: new Date().toISOString(),
    },
    { onConflict: 'procurement_group' }
  );

  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/dashboard');
  revalidatePath('/settings');
  return { ok: true as const };
}

export async function addProcurementLot(formData: FormData) {
  await requireAdmin();

  const group = formData.get('procurement_group') as string;
  const contract_code = (formData.get('contract_code') as string)?.trim();
  const document_no = (formData.get('document_no') as string)?.trim() || null;
  const quantity_liters = Number(formData.get('quantity_liters'));
  const contract_date = (formData.get('contract_date') as string) || null;
  const note = (formData.get('note') as string)?.trim() || null;

  if (!isProcurementGroupId(group)) {
    return { ok: false as const, error: 'ไม่พบกลุ่มจัดซื้อที่เลือก' };
  }
  if (!contract_code) {
    return { ok: false as const, error: 'กรุณากรอกรหัสสัญญา' };
  }
  if (!Number.isFinite(quantity_liters) || quantity_liters <= 0) {
    return { ok: false as const, error: 'จำนวนลิตรต้องมากกว่า 0' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from('fuel_contracts').insert({
    contract_code,
    document_no,
    quantity_liters,
    contract_date,
    notes: note,
    procurement_group: group,
    imported_by: user?.id ?? null,
  });

  if (error) {
    const message = error.code === '23505' ? 'รหัสสัญญานี้มีอยู่แล้ว (ซ้ำกับรายการเดิม)' : error.message;
    return { ok: false as const, error: message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/settings');
  return { ok: true as const };
}
