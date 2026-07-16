'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Image as ImageIcon, Loader2, Paperclip, Trash2, Upload, X } from 'lucide-react';
import {
  deleteRecordDocument,
  getDocumentUrl,
  listRecordDocuments,
  uploadRecordDocument,
  type RecordDocument,
} from '../documents/actions';

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function RecordDocuments({ recordId, count, canEdit }: { recordId: string; count: number; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [documents, setDocuments] = useState<RecordDocument[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const refresh = async () => {
    const result = await listRecordDocuments(recordId);
    if (result.ok) setDocuments(result.documents);
    else setMessage(result.error);
  };

  const onOpen = () => {
    setOpen(true);
    setMessage(null);
    if (!documents) startTransition(refresh);
  };

  const onUpload = (files: FileList | null) => {
    if (!files?.length) return;
    setMessage(null);
    startTransition(async () => {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        const result = await uploadRecordDocument(recordId, formData);
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

  const onView = (documentId: string) => {
    startTransition(async () => {
      const result = await getDocumentUrl(documentId);
      if (result.ok) window.open(result.url, '_blank', 'noopener');
      else setMessage(result.error);
    });
  };

  const onDelete = (documentId: string, fileName: string) => {
    if (!window.confirm(`ลบเอกสาร "${fileName}"?`)) return;
    startTransition(async () => {
      const result = await deleteRecordDocument(documentId);
      if (!result.ok) setMessage(result.error);
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
        title="เอกสารแนบ (ใบส่งน้ำมัน ฯลฯ)"
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold ${
          shownCount > 0
            ? 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100'
            : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
        }`}
      >
        <Paperclip size={13} aria-hidden="true" />
        {shownCount > 0 ? shownCount.toLocaleString('th-TH') : canEdit ? 'แนบ' : '-'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-4 shadow-2xl sm:rounded-xl sm:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-950">เอกสารแนบ</h2>
                <p className="text-xs text-slate-500">ใบส่งน้ำมัน รูปถ่าย หรือเอกสารประกอบ (PDF / รูปภาพ ไม่เกิน 10 MB)</p>
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
                    onClick={() => onView(doc.id)}
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
