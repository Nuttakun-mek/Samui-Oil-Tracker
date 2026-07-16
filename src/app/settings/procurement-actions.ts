'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/server';
import { PROCUREMENT_GROUP_IDS, type ProcurementGroupId } from '@/lib/procurement';
import { ALLOWED_DOCUMENT_MIME, DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES, safeStorageName } from '@/lib/documents';

export interface ContractDocument {
  id: string;
  contract_id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  uploaded_by: string | null;
  uploaded_at: string;
}

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

  const { data: inserted, error } = await supabase
    .from('fuel_contracts')
    .insert({
      contract_code,
      document_no,
      quantity_liters,
      contract_date,
      notes: note,
      procurement_group: group,
      imported_by: user?.id ?? null,
    })
    .select('id')
    .single();

  if (error) {
    const message = error.code === '23505' ? 'รหัสสัญญานี้มีอยู่แล้ว (ซ้ำกับรายการเดิม)' : error.message;
    return { ok: false as const, error: message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/settings');
  return { ok: true as const, contractId: inserted.id as string };
}

export async function deleteProcurementLot(contractId: string) {
  await requireAdmin();

  const supabase = await createClient();
  // ลบเฉพาะแถวที่ผูกกลุ่มผ่านระบบนี้เท่านั้น — สัญญาเก่า (procurement_group = null) แตะไม่ได้
  const { data: lot } = await supabase
    .from('fuel_contracts')
    .select('id, procurement_group')
    .eq('id', contractId)
    .not('procurement_group', 'is', null)
    .maybeSingle();
  if (!lot) return { ok: false as const, error: 'ไม่พบล๊อตที่ต้องการลบ' };

  // ลบไฟล์เอกสารแนบใน storage ก่อน — FK cascade ลบได้เฉพาะแถว metadata ไม่ลบไฟล์จริง
  const { data: documents } = await supabase.from('fuel_contract_documents').select('file_path').eq('contract_id', contractId);
  if (documents?.length) {
    try {
      const admin = createAdminClient();
      await admin.storage.from(DOCUMENTS_BUCKET).remove(documents.map((doc) => doc.file_path as string));
    } catch {
      // ไม่มี service key: ยอมให้ไฟล์ค้างใน storage ดีกว่า block การลบล๊อต
    }
  }

  const { error } = await supabase.from('fuel_contracts').delete().eq('id', contractId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/dashboard');
  revalidatePath('/settings');
  return { ok: true as const };
}

export async function uploadContractDocument(contractId: string, formData: FormData) {
  await requireAdmin();

  const file = formData.get('file');
  if (!(file instanceof File) || !file.size) {
    return { ok: false as const, error: 'ไม่พบไฟล์' };
  }
  if (!ALLOWED_DOCUMENT_MIME.includes(file.type)) {
    return { ok: false as const, error: 'รองรับเฉพาะไฟล์ PDF หรือรูปภาพ (JPG, PNG, WebP)' };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false as const, error: 'ไฟล์ต้องมีขนาดไม่เกิน 10 MB' };
  }

  const supabase = await createClient();
  const { data: contract } = await supabase.from('fuel_contracts').select('id').eq('id', contractId).maybeSingle();
  if (!contract) return { ok: false as const, error: 'ไม่พบสัญญาที่ต้องการแนบเอกสาร' };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false as const, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงอัปโหลดเอกสารไม่ได้' };
  }

  const filePath = `contracts/${contractId}/${safeStorageName(file.name)}`;
  const { error: uploadError } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(filePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (uploadError) return { ok: false as const, error: uploadError.message };

  const { error: insertError } = await admin.from('fuel_contract_documents').insert({
    contract_id: contractId,
    file_path: filePath,
    file_name: file.name,
    mime_type: file.type,
    file_size_bytes: file.size,
    uploaded_by: user?.id ?? null,
  });

  if (insertError) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
    return { ok: false as const, error: insertError.message };
  }

  revalidatePath('/settings');
  return { ok: true as const };
}

export async function listContractDocuments(contractId: string) {
  // RLS (fuel_contract_documents_select → open ให้ authenticated ทุกคน เหมือน fuel_contracts เดิม)
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('fuel_contract_documents')
    .select('*')
    .eq('contract_id', contractId)
    .order('uploaded_at', { ascending: true });

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, documents: (data ?? []) as ContractDocument[] };
}

export async function getContractDocumentUrl(documentId: string) {
  const supabase = await createClient();
  const { data: document } = await supabase
    .from('fuel_contract_documents')
    .select('file_path')
    .eq('id', documentId)
    .maybeSingle();

  if (!document) return { ok: false as const, error: 'ไม่พบเอกสาร หรือไม่มีสิทธิ์เข้าถึง' };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false as const, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงเปิดเอกสารไม่ได้' };
  }

  const { data, error } = await admin.storage.from(DOCUMENTS_BUCKET).createSignedUrl(document.file_path, 600);
  if (error || !data?.signedUrl) return { ok: false as const, error: error?.message ?? 'สร้างลิงก์เอกสารไม่สำเร็จ' };
  return { ok: true as const, url: data.signedUrl };
}

export async function deleteContractDocument(documentId: string) {
  await requireAdmin();

  const supabase = await createClient();
  const { data: document } = await supabase
    .from('fuel_contract_documents')
    .select('id, file_path')
    .eq('id', documentId)
    .maybeSingle();

  if (!document) return { ok: false as const, error: 'ไม่พบเอกสาร หรือไม่มีสิทธิ์เข้าถึง' };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false as const, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงลบเอกสารไม่ได้' };
  }

  const { error: deleteError } = await admin.from('fuel_contract_documents').delete().eq('id', documentId);
  if (deleteError) return { ok: false as const, error: deleteError.message };
  await admin.storage.from(DOCUMENTS_BUCKET).remove([document.file_path]);

  revalidatePath('/settings');
  return { ok: true as const };
}
