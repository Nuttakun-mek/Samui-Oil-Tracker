'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUserAccess } from '@/lib/auth/server';
import type { StationId } from '@/lib/types/domain';

const BUCKET = 'fuel-documents';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export interface RecordDocument {
  id: string;
  record_id: string;
  station_id: StationId;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  uploaded_by: string | null;
  uploaded_at: string;
}

// ทำชื่อไฟล์ให้ปลอดภัยสำหรับ storage key — เก็บชื่อเดิมไว้ใน metadata แยกต่างหาก
function safeStorageName(fileName: string) {
  const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';
  return `${randomUUID()}.${extension}`;
}

export async function uploadRecordDocument(recordId: string, formData: FormData) {
  const access = await getCurrentUserAccess();
  if (access.role === 'viewer') {
    return { ok: false as const, error: 'บัญชีนี้มีสิทธิ์ดูอย่างเดียว ไม่สามารถแนบเอกสารได้' };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || !file.size) {
    return { ok: false as const, error: 'ไม่พบไฟล์' };
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false as const, error: 'รองรับเฉพาะไฟล์ PDF หรือรูปภาพ (JPG, PNG, WebP)' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false as const, error: 'ไฟล์ต้องมีขนาดไม่เกิน 10 MB' };
  }

  const supabase = await createClient();
  const { data: record } = await supabase
    .from('fuel_records')
    .select('id, station_id')
    .eq('id', recordId)
    .maybeSingle();

  if (!record) return { ok: false as const, error: 'ไม่พบ record ที่ต้องการแนบเอกสาร' };
  if (!access.stationIds.includes(record.station_id as StationId)) {
    return { ok: false as const, error: 'บัญชีนี้ไม่มีสิทธิ์แนบเอกสารของพื้นที่นี้' };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false as const, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงอัปโหลดเอกสารไม่ได้' };
  }

  const filePath = `${record.station_id}/${recordId}/${safeStorageName(file.name)}`;
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(filePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type });

  if (uploadError) return { ok: false as const, error: uploadError.message };

  const { error: insertError } = await admin.from('fuel_record_documents').insert({
    record_id: recordId,
    station_id: record.station_id,
    file_path: filePath,
    file_name: file.name,
    mime_type: file.type,
    file_size_bytes: file.size,
    uploaded_by: access.user.id,
  });

  if (insertError) {
    await admin.storage.from(BUCKET).remove([filePath]);
    return { ok: false as const, error: insertError.message };
  }

  revalidatePath('/history');
  return { ok: true as const };
}

export async function listRecordDocuments(recordId: string) {
  // RLS (record_documents_select → has_station_access) กรองแถวที่ไม่มีสิทธิ์ให้เอง
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('fuel_record_documents')
    .select('*')
    .eq('record_id', recordId)
    .order('uploaded_at', { ascending: true });

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, documents: (data ?? []) as RecordDocument[] };
}

export async function getDocumentUrl(documentId: string) {
  const supabase = await createClient();
  const { data: document } = await supabase
    .from('fuel_record_documents')
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

  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(document.file_path, 600);
  if (error || !data?.signedUrl) return { ok: false as const, error: error?.message ?? 'สร้างลิงก์เอกสารไม่สำเร็จ' };
  return { ok: true as const, url: data.signedUrl };
}

export async function deleteRecordDocument(documentId: string) {
  const access = await getCurrentUserAccess();
  if (access.role === 'viewer') {
    return { ok: false as const, error: 'บัญชีนี้มีสิทธิ์ดูอย่างเดียว ไม่สามารถลบเอกสารได้' };
  }

  const supabase = await createClient();
  const { data: document } = await supabase
    .from('fuel_record_documents')
    .select('id, station_id, file_path, uploaded_by')
    .eq('id', documentId)
    .maybeSingle();

  if (!document) return { ok: false as const, error: 'ไม่พบเอกสาร หรือไม่มีสิทธิ์เข้าถึง' };

  const canDelete =
    access.role === 'admin' ||
    (access.stationIds.includes(document.station_id as StationId) && document.uploaded_by === access.user.id);
  if (!canDelete) {
    return { ok: false as const, error: 'ลบได้เฉพาะเอกสารที่ตนเองอัปโหลด หรือโดยผู้ดูแลระบบ' };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false as const, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงลบเอกสารไม่ได้' };
  }

  const { error: deleteError } = await admin.from('fuel_record_documents').delete().eq('id', documentId);
  if (deleteError) return { ok: false as const, error: deleteError.message };
  await admin.storage.from(BUCKET).remove([document.file_path]);

  revalidatePath('/history');
  return { ok: true as const };
}
