'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, FileText, Image as ImageIcon, Loader2, Paperclip, Trash2, Upload, X } from 'lucide-react';

export interface AttachedDocument {
  id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function DocumentAttachments<T extends AttachedDocument>({
  entityId,
  count,
  canEdit,
  title = 'เอกสารแนบ',
  description = 'PDF หรือรูปภาพ ไม่เกิน 10 MB',
  buttonTitle = 'เอกสารแนบ',
  list,
  upload,
  getUrl,
  remove,
}: {
  entityId: string;
  count: number;
  canEdit: boolean;
  title?: string;
  description?: string;
  buttonTitle?: string;
  list: (id: string) => Promise<{ ok: true; documents: T[] } | { ok: false; error: string }>;
  upload: (id: string, formData: FormData) => Promise<{ ok: boolean; error?: string }>;
  getUrl: (documentId: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
  remove: (documentId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [documents, setDocuments] = useState<T[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<{ url: string; fileName: string; mimeType: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const refresh = async () => {
    const result = await list(entityId);
    if (result.ok) setDocuments(result.documents);
    else setMessage(result.error);
  };

  const onOpen = () => {
    setOpen(true);
    setMessage(null);
    setPreview(null);
    if (!documents) startTransition(refresh);
  };

  const onUpload = (files: FileList | null) => {
    if (!files?.length) return;
    setMessage(null);
    startTransition(async () => {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        const result = await upload(entityId, formData);
        if (!result.ok) {
          setMessage(`${file.name}: ${result.error}`);
          break;
        }
      }
      await refresh();
      router.refresh();
      if (fileInputRef.current) fileInputRef.current.value = '';
    });
  };

  const onView = (doc: T) => {
    startTransition(async () => {
      const result = await getUrl(doc.id);
      if (result.ok) setPreview({ url: result.url, fileName: doc.file_name, mimeType: doc.mime_type });
      else setMessage(result.error);
    });
  };

  // signed URL ของ Supabase Storage อยู่คนละ origin กับแอป — attribute `download` บน <a> เฉยๆ จะถูกเบราว์เซอร์เมิน
  // (บังคับดาวน์โหลดได้เฉพาะ same-origin) ต้อง fetch เป็น blob แล้วสร้างลิงก์ดาวน์โหลดแบบ same-origin เอง
  const onDownload = async (url: string, fileName: string) => {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(blobUrl);
  };

  const onDelete = (documentId: string, fileName: string) => {
    if (!window.confirm(`ลบเอกสาร "${fileName}"?`)) return;
    startTransition(async () => {
      const result = await remove(documentId);
      if (!result.ok) setMessage(result.error ?? 'ลบเอกสารไม่สำเร็จ');
      await refresh();
      router.refresh();
    });
  };

  const shownCount = documents ? documents.length : count;

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        title={buttonTitle}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold ${
          shownCount > 0
            ? 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100'
            : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
        }`}
      >
        <Paperclip size={13} aria-hidden="true" />
        {shownCount > 0 ? shownCount.toLocaleString('th-TH') : canEdit ? 'แนบ' : '-'}
      </button>

      {open && preview && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl sm:rounded-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <button type="button" onClick={() => setPreview(null)} className="btn-secondary !min-h-8 !px-2.5" aria-label="กลับไปที่รายการ">
                  <ArrowLeft size={15} aria-hidden="true" />
                </button>
                <h2 className="truncate text-sm font-extrabold text-slate-950" title={preview.fileName}>{preview.fileName}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" onClick={() => onDownload(preview.url, preview.fileName)} className="btn-secondary !min-h-8 !px-2.5" title="ดาวน์โหลด">
                  <Download size={15} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setOpen(false)} className="btn-secondary !min-h-8 !px-2.5" aria-label="ปิด">
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 p-2 sm:p-3">
              {preview.mimeType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.url} alt={preview.fileName} className="mx-auto max-h-[75vh] w-auto max-w-full rounded-md object-contain" />
              ) : preview.mimeType === 'application/pdf' ? (
                <iframe src={preview.url} title={preview.fileName} className="h-[75vh] w-full rounded-md border-0 bg-white" />
              ) : (
                <p className="py-10 text-center text-sm text-slate-500">ไม่รองรับการแสดงตัวอย่างไฟล์ประเภทนี้ — ใช้ปุ่มดาวน์โหลดด้านบนแทน</p>
              )}
            </div>
          </div>
        </div>
      )}

      {open && !preview && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-4 shadow-2xl sm:rounded-xl sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-950">{title}</h2>
                <p className="text-xs text-slate-500">{description}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary !min-h-8 !px-2.5" aria-label="ปิด">
                <X size={15} aria-hidden="true" />
              </button>
            </div>

            {canEdit && (
              <label className="mb-3 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-brand-300 bg-brand-50/50 px-3 text-sm font-bold text-brand-700 hover:bg-brand-50">
                {isPending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
                เลือกไฟล์เพื่ออัปโหลด
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={isPending}
                  onChange={(event) => onUpload(event.target.files)}
                />
              </label>
            )}

            {message && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{message}</p>}

            <ul className="divide-y divide-slate-100">
              {documents === null && <li className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</li>}
              {documents?.length === 0 && <li className="py-6 text-center text-sm text-slate-400">ยังไม่มีเอกสารแนบ</li>}
              {documents?.map((doc) => (
                <li key={doc.id} className="flex items-center gap-2.5 py-2.5">
                  {doc.mime_type === 'application/pdf'
                    ? <FileText size={18} className="shrink-0 text-red-600" aria-hidden="true" />
                    : <ImageIcon size={18} className="shrink-0 text-brand-600" aria-hidden="true" />}
                  <button
                    type="button"
                    onClick={() => onView(doc)}
                    className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-800 underline-offset-2 hover:text-brand-700 hover:underline"
                    title="เปิดดูเอกสาร"
                  >
                    {doc.file_name}
                  </button>
                  <span className="shrink-0 text-xs tabular-nums text-slate-400">{formatBytes(doc.file_size_bytes)}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onDelete(doc.id, doc.file_name)}
                      disabled={isPending}
                      className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`ลบ ${doc.file_name}`}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
