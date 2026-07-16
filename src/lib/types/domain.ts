import { z } from 'zod';

export const STATION_IDS = ['samui', 'phangan', 'koh_tao'] as const;
export type StationId = (typeof STATION_IDS)[number];

export const STATION_LABEL: Record<StationId, string> = {
  samui: 'สถานีไฟฟ้าสมุย 1 (บ้านพังกา)',
  phangan: 'พื้นที่ติดตั้งเครื่องกำเนิดไฟฟ้าชั่วคราว ต.ลิปะน้อย',
  koh_tao: 'โรงจักร เกาะเต่า',
};

export interface Station {
  id: StationId;
  name: string;
  tank_capacity_liters: number;
  low_stock_days: number;
  fuel_price_per_liter: number;
  has_dispatch_breakdown: boolean;
}

export interface FuelRecord {
  id: string;
  station_id: StationId;
  record_date: string; // ISO date
  opening_liters: number;
  received_liters: number;
  plan_received_liters: number;
  dispatched_liters: number;
  dispatched_namsaeng: number | null;
  dispatched_kfp: number | null;
  closing_liters: number;
  employee_code: string | null;
  vehicle_plate: string | null;
  reference_document_no: string | null;
  contract_code: string | null;
  record_source: 'manual' | 'upload' | 'database';
  source_file_name: string | null;
  source_sheet_name: string | null;
  source_note: string | null;
  note: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- form validation ----------
export const fuelRecordFormSchema = z
  .object({
    station_id: z.enum(STATION_IDS),
    record_date: z.string().min(1, 'กรุณาเลือกวันที่'),
    opening_liters: z.coerce.number().min(0, 'ต้องไม่ติดลบ'),
    received_liters: z.coerce.number().min(0, 'ต้องไม่ติดลบ'),
    plan_received_liters: z.coerce.number().min(0).default(0),
    dispatched_liters: z.coerce.number().min(0).default(0),
    dispatched_namsaeng: z.coerce.number().min(0).optional(),
    dispatched_kfp: z.coerce.number().min(0).optional(),
    employee_code: z.string().trim().min(1, 'กรุณากรอกรหัสพนักงาน').max(50, 'รหัสพนักงานยาวเกินไป'),
    vehicle_plate: z.string().trim().max(30, 'ทะเบียนรถยาวเกินไป').optional(),
    reference_document_no: z.string().trim().max(100, 'เลขอ้างอิงยาวเกินไป').optional(),
    contract_code: z.string().trim().max(100, 'รหัสสัญญายาวเกินไป').optional(),
    note: z.string().max(500).optional(),
    confirmed: z.boolean().refine((value) => value, 'กรุณายืนยันว่าตรวจสอบตัวเลขแล้ว'),
  })
  .refine(
    (data) => computeClosing(data) >= 0,
    { message: 'ยอดจ่ายมากกว่ายอดน้ำมันที่มีอยู่', path: ['dispatched_liters'] }
  )
  .refine(
    (data) => {
      // เกาะเต่าต้องกรอกยอดจ่ายแยก 2 รายการ
      if (data.station_id === 'koh_tao') {
        return data.dispatched_namsaeng !== undefined && data.dispatched_kfp !== undefined;
      }
      return true;
    },
    { message: 'เกาะเต่าต้องกรอกยอดจ่ายนำแสงและเครื่อง กฟภ.', path: ['dispatched_namsaeng'] }
  );

export type FuelRecordFormValues = z.infer<typeof fuelRecordFormSchema>;

export function computeClosing(values: {
  station_id: StationId;
  opening_liters: number;
  received_liters: number;
  dispatched_liters: number;
  dispatched_namsaeng?: number;
  dispatched_kfp?: number;
}) {
  const dispatched =
    values.station_id === 'koh_tao'
      ? (values.dispatched_namsaeng ?? 0) + (values.dispatched_kfp ?? 0)
      : values.dispatched_liters;
  return values.opening_liters + values.received_liters - dispatched;
}
