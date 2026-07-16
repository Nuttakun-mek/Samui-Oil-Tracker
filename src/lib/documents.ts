import { randomUUID } from 'crypto';

export const DOCUMENTS_BUCKET = 'fuel-documents';
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_DOCUMENT_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// ทำชื่อไฟล์ให้ปลอดภัยสำหรับ storage key — เก็บชื่อเดิมไว้ใน metadata แยกต่างหาก
export function safeStorageName(fileName: string) {
  const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';
  return `${randomUUID()}.${extension}`;
}
