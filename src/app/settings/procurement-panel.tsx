'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, PlusCircle, Trash2 } from 'lucide-react';
import type { ProcurementGroupSummary, ProcurementSummary } from '@/lib/procurement';
import { formatThaiDateCompact } from '@/lib/format/thai-date';
import { NumberInput } from '@/components/ui/number-input';
import { setGroupBaseline, addProcurementLot, deleteProcurementLot, uploadContractDocument } from './procurement-actions';
import { ContractDocuments } from './contract-documents';

function useFormSubmit(action: (formData: FormData) => Promise<{ ok: boolean; error?: string }>) {
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const submit = (formData: FormData, onSuccess?: () => void) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action(formData);
      setIsSuccess(result.ok);
      setMessage(result.ok ? 'บันทึกแล้ว' : (result.error ?? 'เกิดข้อผิดพลาด'));
      if (result.ok) {
        onSuccess?.();
        router.refresh();
        setTimeout(() => setMessage(null), 3000);
      }
    });
  };

  return { submit, message, isSuccess, isPending };
}

function FormFeedback({ message, isSuccess }: { message: string | null; isSuccess: boolean }) {
  if (!message) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${isSuccess ? 'text-brand-700' : 'text-red-600'}`}>
      {isSuccess && <CheckCircle2 size={14} aria-hidden="true" />}
      {message}
    </span>
  );
}

function GroupPanel({ group }: { group: ProcurementGroupSummary }) {
  const baselineForm = useFormSubmit(setGroupBaseline);
  const [lotMessage, setLotMessage] = useState<string | null>(null);
  const [lotSuccess, setLotSuccess] = useState(false);
  const [isLotPending, startLotTransition] = useTransition();
  const lotFileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // ตัวเลขก้อนใหญ่ (ยอดตั้งต้น/เกณฑ์แจ้งเตือน/จำนวนล๊อต) ใช้ NumberInput ที่มีลูกน้ำคั่นหลักขณะพิมพ์
  // เพื่อกันพิมพ์ผิดหลัก (เผลอใส่/ขาดเลข 0) เพราะเป็นตัวเลขสำคัญที่กระทบยอดคงเหลือของทั้งกลุ่มทันที
  const [baselineLiters, setBaselineLiters] = useState(group.baseline?.liters ?? 0);
  const [warnBelowLiters, setWarnBelowLiters] = useState(group.baseline?.warnBelowLiters ?? 0);
  const [quantityLiters, setQuantityLiters] = useState(0);
  useEffect(() => {
    setBaselineLiters(group.baseline?.liters ?? 0);
    setWarnBelowLiters(group.baseline?.warnBelowLiters ?? 0);
  }, [group.baseline?.liters, group.baseline?.warnBelowLiters]);

  const onLotSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = lotFileInputRef.current?.files?.[0] ?? null;
    setLotMessage(null);
    startLotTransition(async () => {
      const result = await addProcurementLot(formData);
      if (!result.ok) {
        setLotSuccess(false);
        setLotMessage(result.error);
        return;
      }
      let message = 'บันทึกแล้ว';
      if (file) {
        const fileForm = new FormData();
        fileForm.append('file', file);
        const uploadResult = await uploadContractDocument(result.contractId, fileForm);
        if (!uploadResult.ok) message = `บันทึกล๊อตสำเร็จ แต่แนบเอกสารไม่สำเร็จ: ${uploadResult.error}`;
      }
      setLotSuccess(true);
      setLotMessage(message);
      form.reset();
      setQuantityLiters(0);
      router.refresh();
      setTimeout(() => setLotMessage(null), 4000);
    });
  };

  const onDeleteLot = (lotId: string, label: string) => {
    if (!window.confirm(`ลบล๊อต "${label}" ออกจากประวัติ? ยอดคงเหลือของกลุ่มจะถูกคำนวณใหม่ทันที`)) return;
    startLotTransition(async () => {
      const result = await deleteProcurementLot(lotId);
      setLotSuccess(result.ok);
      setLotMessage(result.ok ? 'ลบล๊อตแล้ว' : (result.error ?? 'ลบไม่สำเร็จ'));
      if (result.ok) {
        router.refresh();
        setTimeout(() => setLotMessage(null), 3000);
      }
    });
  };

  return (
    <div className="panel space-y-4">
      <div>
        <h3 className="text-base font-extrabold text-slate-950">{group.label}</h3>
        <p className="text-sm text-slate-500">{group.detail}</p>
      </div>

      {group.baseline ? (
        <div className="rounded-lg bg-slate-50 px-3.5 py-3 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-2xl font-extrabold tabular-nums text-slate-950">
              {(group.balance ?? 0).toLocaleString('th-TH')} <small className="text-sm font-semibold text-slate-500">ลิตรคงเหลือ</small>
            </span>
            {group.isLow && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">ต่ำกว่าเกณฑ์แจ้งเตือน</span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            ยอดเริ่มต้น {group.baseline.liters.toLocaleString('th-TH')} ลิตร ณ {formatThaiDateCompact(group.baseline.date)} · เติมมาแล้ว {group.contractsCount}{' '}
            ครั้ง รวม {group.contractsSum.toLocaleString('th-TH')} ลิตร · รับเข้าแล้ว {group.receivedSum.toLocaleString('th-TH')} ลิตร
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm font-semibold text-amber-800">
          ยังไม่ได้ตั้งยอดคงเหลือเริ่มต้นของกลุ่มนี้ — กรอกแบบฟอร์มด้านล่างเพื่อเริ่มติดตาม
        </div>
      )}

      <details className="rounded-lg border border-slate-200 px-3.5 py-2.5">
        <summary className="cursor-pointer text-sm font-bold text-slate-700">
          {group.baseline ? 'แก้ไขยอดเริ่มต้น / เกณฑ์แจ้งเตือน' : 'ตั้งยอดคงเหลือเริ่มต้น'}
        </summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            baselineForm.submit(new FormData(event.currentTarget));
          }}
          className="mt-3 space-y-3"
        >
          <input type="hidden" name="procurement_group" value={group.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">ยอดคงเหลือเริ่มต้น (ลิตร)</label>
              <NumberInput value={baselineLiters} onChange={setBaselineLiters} />
              <input type="hidden" name="baseline_liters" value={baselineLiters} />
            </div>
            <div>
              <label className="field-label">วันที่อ้างอิง</label>
              <input name="baseline_date" type="date" defaultValue={group.baseline?.date ?? ''} className="field" required />
            </div>
            <div>
              <label className="field-label">แจ้งเตือนเมื่อคงเหลือต่ำกว่า (ลิตร)</label>
              <NumberInput value={warnBelowLiters} onChange={setWarnBelowLiters} />
              <input type="hidden" name="warn_below_liters" value={warnBelowLiters} />
            </div>
            <div>
              <label className="field-label">หมายเหตุ</label>
              <input name="note" type="text" defaultValue={group.baseline?.note ?? ''} className="field" />
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button type="submit" disabled={baselineForm.isPending} className="btn-secondary">
              {baselineForm.isPending ? 'กำลังบันทึก...' : 'บันทึกยอดเริ่มต้น'}
            </button>
            <FormFeedback message={baselineForm.message} isSuccess={baselineForm.isSuccess} />
          </div>
        </form>
      </details>

      <div className="rounded-lg border border-slate-200 px-3.5 py-3">
        <h4 className="text-sm font-bold text-slate-700">เพิ่มล๊อตใหม่</h4>
        <p className="mt-0.5 text-xs text-slate-500">
          ใช้เมื่อซื้อล๊อตใหญ่เพิ่มจริง (มีเลขสัญญาใหม่) — ถ้าต้องการแค่ตั้งยอดคงเหลือปัจจุบันโดยไม่มีเลขสัญญา ให้ใช้ฟอร์ม
          &ldquo;ตั้งยอดคงเหลือเริ่มต้น&rdquo; ด้านบนแทน
        </p>
        <form onSubmit={onLotSubmit} className="mt-2 space-y-3">
          <input type="hidden" name="procurement_group" value={group.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">รหัสสัญญา</label>
              <input name="contract_code" type="text" className="field" required />
            </div>
            <div>
              <label className="field-label">เลขที่เอกสาร</label>
              <input name="document_no" type="text" className="field" />
            </div>
            <div>
              <label className="field-label">จำนวน (ลิตร)</label>
              <NumberInput value={quantityLiters} onChange={setQuantityLiters} />
              <input type="hidden" name="quantity_liters" value={quantityLiters} />
            </div>
            <div>
              <label className="field-label">วันที่สัญญา</label>
              <input name="contract_date" type="date" className="field" />
            </div>
          </div>
          <div>
            <label className="field-label">หมายเหตุ</label>
            <input name="note" type="text" className="field" />
          </div>
          <div>
            <label className="field-label">แนบเอกสารสัญญา (ถ้ามี)</label>
            <input
              ref={lotFileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="field file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-brand-700"
            />
          </div>
          <div className="flex items-center gap-2.5">
            <button type="submit" disabled={isLotPending} className="btn-primary">
              <PlusCircle size={16} aria-hidden="true" />
              {isLotPending ? 'กำลังบันทึก...' : 'เพิ่มล๊อตนี้'}
            </button>
            <FormFeedback message={lotMessage} isSuccess={lotSuccess} />
          </div>
        </form>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-bold text-slate-700">
          ประวัติการเติมล๊อต ({group.contractsCount.toLocaleString('th-TH')} ครั้ง · รวม {group.contractsSum.toLocaleString('th-TH')} ลิตร)
        </h4>
        <div className="table-shell">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-3 py-2 text-left">วันที่</th>
                <th className="px-3 py-2 text-left">รหัสสัญญา</th>
                <th className="px-3 py-2 text-right">จำนวน (ลิตร)</th>
                <th className="px-3 py-2 text-left">เพิ่มโดย</th>
                <th className="px-3 py-2 text-left">เมื่อ</th>
                <th className="px-3 py-2 text-left">เอกสาร</th>
              </tr>
            </thead>
            <tbody>
              {group.contracts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    ยังไม่มีการเติมล๊อต
                  </td>
                </tr>
              )}
              {group.contracts.map((lot) => (
                <tr key={lot.id} className="border-t border-slate-200">
                  <td className="px-3 py-2 whitespace-nowrap">{lot.contractDate ? formatThaiDateCompact(lot.contractDate) : '-'}</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">
                    {lot.contractCode}
                    {lot.documentNo ? ` / ${lot.documentNo}` : ''}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">+{lot.quantityLiters.toLocaleString('th-TH')}</td>
                  <td className="px-3 py-2">{lot.addedBy ?? '-'}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {new Date(lot.addedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' })}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <ContractDocuments contractId={lot.id} count={lot.documentsCount} canEdit />
                      <button
                        type="button"
                        onClick={() => onDeleteLot(lot.id, lot.contractCode)}
                        disabled={isLotPending}
                        className="rounded-md border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40"
                        title="ลบล๊อตนี้ (กรณีกรอกผิด)"
                        aria-label={`ลบล๊อต ${lot.contractCode}`}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ProcurementPanel({ summary }: { summary: ProcurementSummary }) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold text-slate-950">จัดซื้อล๊อตใหญ่</h2>
        <p className="text-sm text-slate-600">
          ตั้งยอดคงเหลือเริ่มต้นและบันทึกทุกครั้งที่ซื้อล๊อตใหญ่เพิ่ม ระบบคำนวณยอดคงเหลือ = ยอดเริ่มต้น + ล๊อตที่เติมทั้งหมด −
          ยอดรับเข้าที่บันทึกในฟอร์มรายวัน (นับตั้งแต่วันที่ตั้งยอดเริ่มต้น) ให้อัตโนมัติ
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {summary.groups.map((group) => (
          <GroupPanel key={group.id} group={group} />
        ))}
      </div>

      <details className="rounded-lg border border-slate-200 px-3.5 py-2.5">
        <summary className="cursor-pointer text-sm font-bold text-slate-700">
          ประวัติสัญญาเก่า (ก่อนเริ่มระบบนี้ — ไม่รวมในยอดคงเหลือด้านบน) · {summary.legacyContracts.length.toLocaleString('th-TH')} รายการ
        </summary>
        <div className="table-shell mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-3 py-2 text-left">วันที่</th>
                <th className="px-3 py-2 text-left">รหัสสัญญา</th>
                <th className="px-3 py-2 text-right">จำนวน (ลิตร)</th>
                <th className="px-3 py-2 text-left">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {summary.legacyContracts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    ไม่มีสัญญาเก่า
                  </td>
                </tr>
              )}
              {summary.legacyContracts.map((c) => (
                <tr key={c.id} className="border-t border-slate-200">
                  <td className="px-3 py-2 whitespace-nowrap">{c.contractDate ? formatThaiDateCompact(c.contractDate) : '-'}</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">
                    {c.contractCode}
                    {c.documentNo ? ` / ${c.documentNo}` : ''}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.quantityLiters.toLocaleString('th-TH')}</td>
                  <td className="px-3 py-2 text-slate-600">{c.notes ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
