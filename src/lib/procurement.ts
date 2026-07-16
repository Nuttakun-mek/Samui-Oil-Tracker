import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { StationId } from '@/lib/types/domain';

export const PROCUREMENT_GROUP_IDS = ['group_samui', 'group_koh_tao'] as const;
export type ProcurementGroupId = (typeof PROCUREMENT_GROUP_IDS)[number];

export const PROCUREMENT_GROUP_LABEL: Record<ProcurementGroupId, string> = {
  group_samui: 'กลุ่มเกาะสมุย',
  group_koh_tao: 'กลุ่มเกาะเต่า',
};

export const PROCUREMENT_GROUP_DETAIL: Record<ProcurementGroupId, string> = {
  group_samui: 'สถานีไฟฟ้าสมุย 1 + ลิปะน้อย (พูลรวม)',
  group_koh_tao: 'โรงจักรเกาะเต่า',
};

export const PROCUREMENT_GROUP_STATIONS: Record<ProcurementGroupId, StationId[]> = {
  group_samui: ['samui', 'phangan'],
  group_koh_tao: ['koh_tao'],
};

export const STATION_PROCUREMENT_GROUP: Record<StationId, ProcurementGroupId> = {
  samui: 'group_samui',
  phangan: 'group_samui',
  koh_tao: 'group_koh_tao',
};

export interface ProcurementLot {
  id: string;
  contractCode: string;
  documentNo: string | null;
  quantityLiters: number;
  contractDate: string | null;
  note: string | null;
  addedBy: string | null;
  addedAt: string;
}

export interface LegacyContract {
  id: string;
  contractCode: string;
  documentNo: string | null;
  quantityLiters: number;
  contractDate: string | null;
  notes: string | null;
}

export interface ProcurementGroupSummary {
  id: ProcurementGroupId;
  label: string;
  detail: string;
  stations: StationId[];
  baseline: { liters: number; date: string; warnBelowLiters: number; note: string | null } | null;
  contracts: ProcurementLot[];
  contractsCount: number;
  contractsSum: number;
  receivedSum: number;
  balance: number | null;
  isLow: boolean;
}

export interface ProcurementSummary {
  groups: ProcurementGroupSummary[];
  legacyContracts: LegacyContract[];
}

type Queryable = ReturnType<typeof createAdminClient> | Awaited<ReturnType<typeof createClient>>;

async function fetchProcurementRows(supabase: Queryable) {
  const [{ data: baselines }, { data: contracts }, { data: profiles }] = await Promise.all([
    supabase.from('fuel_group_baseline').select('*'),
    supabase.from('fuel_contracts').select('*').order('contract_date', { ascending: false }),
    supabase.from('profiles').select('id, full_name'),
  ]);
  return { baselines: baselines ?? [], contracts: contracts ?? [], profiles: profiles ?? [] };
}

// ยอดคงเหลือของกลุ่ม = ยอดตั้งต้น + สัญญาที่ผูกกลุ่มไว้ทั้งหมด − ยอดรับสะสมของสถานีในกลุ่มนับจากวันตั้งยอดเริ่มต้น
async function receivedSince(supabase: Queryable, stationIds: StationId[], fromDate: string) {
  const { data } = await supabase
    .from('fuel_records')
    .select('received_liters')
    .in('station_id', stationIds)
    .gte('record_date', fromDate);
  return (data ?? []).reduce((sum: number, row: { received_liters: number }) => sum + Number(row.received_liters ?? 0), 0);
}

export async function getProcurementSummary(): Promise<ProcurementSummary> {
  let supabase: Queryable;
  try {
    supabase = createAdminClient();
  } catch {
    // ไม่มี service key: fallback ไปใช้ client ปกติ (ผ่าน RLS ตามสิทธิ์ผู้ใช้)
    supabase = await createClient();
  }

  const { baselines, contracts, profiles } = await fetchProcurementRows(supabase);
  const nameById = new Map(profiles.map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]));

  const groups: ProcurementGroupSummary[] = await Promise.all(
    PROCUREMENT_GROUP_IDS.map(async (groupId) => {
      const baselineRow = baselines.find((b: { procurement_group: string }) => b.procurement_group === groupId);
      const groupContracts = contracts.filter((c: { procurement_group: string | null }) => c.procurement_group === groupId);
      const contractsSum = groupContracts.reduce((sum: number, c: { quantity_liters: number }) => sum + Number(c.quantity_liters ?? 0), 0);

      const baseline = baselineRow
        ? {
            liters: Number(baselineRow.baseline_liters),
            date: baselineRow.baseline_date as string,
            warnBelowLiters: Number(baselineRow.warn_below_liters ?? 0),
            note: (baselineRow.note as string | null) ?? null,
          }
        : null;

      const receivedSum = baseline ? await receivedSince(supabase, PROCUREMENT_GROUP_STATIONS[groupId], baseline.date) : 0;
      const balance = baseline ? baseline.liters + contractsSum - receivedSum : null;

      return {
        id: groupId,
        label: PROCUREMENT_GROUP_LABEL[groupId],
        detail: PROCUREMENT_GROUP_DETAIL[groupId],
        stations: PROCUREMENT_GROUP_STATIONS[groupId],
        baseline,
        contracts: groupContracts.map((c: any) => ({
          id: c.id,
          contractCode: c.contract_code,
          documentNo: c.document_no,
          quantityLiters: Number(c.quantity_liters ?? 0),
          contractDate: c.contract_date,
          note: c.notes,
          addedBy: nameById.get(c.imported_by) ?? null,
          addedAt: c.imported_at,
        })),
        contractsCount: groupContracts.length,
        contractsSum,
        receivedSum,
        balance,
        isLow: balance !== null && baseline !== null && balance < baseline.warnBelowLiters,
      };
    })
  );

  const legacyContracts: LegacyContract[] = contracts
    .filter((c: { procurement_group: string | null }) => !c.procurement_group)
    .map((c: any) => ({
      id: c.id,
      contractCode: c.contract_code,
      documentNo: c.document_no,
      quantityLiters: Number(c.quantity_liters ?? 0),
      contractDate: c.contract_date,
      notes: c.notes,
    }));

  return { groups, legacyContracts };
}
