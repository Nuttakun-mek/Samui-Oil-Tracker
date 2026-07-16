'use client';

import { DocumentAttachments } from '@/components/document-attachments';
import { deleteRecordDocument, getDocumentUrl, listRecordDocuments, uploadRecordDocument } from '../documents/actions';

export function RecordDocuments({ recordId, count, canEdit }: { recordId: string; count: number; canEdit: boolean }) {
  return (
    <DocumentAttachments
      entityId={recordId}
      count={count}
      canEdit={canEdit}
      buttonTitle="เอกสารแนบ (ใบส่งน้ำมัน ฯลฯ)"
      description="ใบส่งน้ำมัน รูปถ่าย หรือเอกสารประกอบ (PDF / รูปภาพ ไม่เกิน 10 MB)"
      list={listRecordDocuments}
      upload={uploadRecordDocument}
      getUrl={getDocumentUrl}
      remove={deleteRecordDocument}
    />
  );
}
