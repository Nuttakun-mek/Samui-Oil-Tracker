'use client';

import { DocumentAttachments } from '@/components/document-attachments';
import { deleteContractDocument, getContractDocumentUrl, listContractDocuments, uploadContractDocument } from './procurement-actions';

export function ContractDocuments({ contractId, count, canEdit }: { contractId: string; count: number; canEdit: boolean }) {
  return (
    <DocumentAttachments
      entityId={contractId}
      count={count}
      canEdit={canEdit}
      title="เอกสารสัญญาแนบ"
      buttonTitle="เอกสารสัญญา (PO, ใบสัญญา ฯลฯ)"
      description="PO ใบสัญญาซื้อขาย หรือเอกสารประกอบ (PDF / รูปภาพ ไม่เกิน 10 MB)"
      list={listContractDocuments}
      upload={uploadContractDocument}
      getUrl={getContractDocumentUrl}
      remove={deleteContractDocument}
    />
  );
}
