'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/server';
import { computeClosing, STATION_IDS, type StationId } from '@/lib/types/domain';
import {
  OPERATIONAL_DATA_TABLES,
  type OperationalDataCounts,
  type OperationalDataTable,
} from './reset-data-config';

type ImportFuelRecordRow = {
  station_id?: string;
  station?: string;
  record_date?: string | number | Date;
  opening_liters?: string | number;
  received_liters?: string | number;
  plan_received_liters?: string | number;
  available_liters?: string | number;
  dispatched_liters?: string | number;
  dispatched_namsaeng?: string | number;
  dispatched_kfp?: string | number;
  closing_liters?: string | number;
  employee_code?: string | number;
  source_sheet_name?: string;
  note?: string;
};

type DatabaseExportKind =
  | 'sites'
  | 'daily_fuel_balance'
  | 'monthly_summary'
  | 'delivery_plan_log'
  | 'fuel_contracts'
  | 'file_manifest';

type DatabaseExportRow = Record<string, string | number | undefined>;

const EXPORT_KIND_LABEL: Record<DatabaseExportKind, string> = {
  sites: 'sites.csv',
  daily_fuel_balance: 'daily_fuel_balance.csv',
  monthly_summary: 'monthly_summary.csv',
  delivery_plan_log: 'delivery_plan_log.csv',
  fuel_contracts: 'fuel_contracts.csv',
  file_manifest: 'file_manifest.csv',
};

async function readOperationalDataCounts(supabase: Awaited<ReturnType<typeof createClient>>) {
  const entries = await Promise.all(
    OPERATIONAL_DATA_TABLES.map(async (table) => {
      const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
      return [table, error ? null : (count ?? 0)] as const;
    })
  );

  return Object.fromEntries(entries) as OperationalDataCounts;
}

export async function updateStationSettings(formData: FormData) {
  await requireAdmin();

  const id = formData.get('id') as string;
  const tank_capacity_liters = Number(formData.get('tank_capacity_liters'));
  const low_stock_days = Number(formData.get('low_stock_days'));
  const fuel_price_per_liter = Number(formData.get('fuel_price_per_liter'));

  if (
    !Number.isFinite(tank_capacity_liters) || tank_capacity_liters < 0 ||
    !Number.isFinite(low_stock_days) || low_stock_days < 0 ||
    !Number.isFinite(fuel_price_per_liter) || fuel_price_per_liter < 0
  ) {
    return { ok: false as const, error: 'ค่าตั้งค่าสถานีต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' };
  }

  const supabase = await createClient();
  // RLS (stations_write) จะปฏิเสธถ้าไม่ใช่ admin — ไม่ต้องเช็ค role ซ้ำในโค้ดฝั่งนี้
  const { error } = await supabase
    .from('stations')
    .update({ tank_capacity_liters, low_stock_days, fuel_price_per_liter })
    .eq('id', id);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  revalidatePath('/reports');
  return { ok: true as const };
}

export async function resetOperationalData() {
  await requireAdmin();

  const supabase = await createClient();
  const before = await readOperationalDataCounts(supabase);
  const { error } = await supabase.rpc('admin_reset_operational_data');

  if (!error) {
    const after = await readOperationalDataCounts(supabase);
    const remaining = OPERATIONAL_DATA_TABLES.filter((table) => (after[table] ?? 0) > 0);
    if (remaining.length) {
      return {
        ok: false as const,
        error: `คำสั่งล้างทำงานแล้ว แต่ยังพบข้อมูลใน ${remaining.join(', ')}`,
        before,
        after,
      };
    }

    revalidatePath('/settings');
    revalidatePath('/dashboard');
    revalidatePath('/entry');
    revalidatePath('/history');
    return { ok: true as const, before, after };
  }

  const fallbackTables: OperationalDataTable[] = [
    'delivery_plan_log',
    'monthly_import_summaries',
    'import_file_manifest',
    'fuel_contracts',
    'fuel_records',
    // Deleting fuel records can create audit rows, so audit must be cleared last.
    'fuel_records_audit',
  ];
  const fallbackErrors: string[] = [];

  for (const table of fallbackTables) {
    const { error: deleteError } = await supabase.from(table).delete().not('id', 'is', null);
    const missingTable =
      deleteError?.code === 'PGRST205' ||
      deleteError?.message.toLowerCase().includes('schema cache') ||
      deleteError?.message.toLowerCase().includes('does not exist');
    if (deleteError && !missingTable) {
      fallbackErrors.push(`${table}: ${deleteError.message}`);
    }
  }

  if (fallbackErrors.length) {
    return {
      ok: false as const,
      error: fallbackErrors.join('\n'),
      before,
    };
  }

  const after = await readOperationalDataCounts(supabase);
  const remainingMainData = fallbackTables.filter((table) => (after[table] ?? 0) > 0);
  const auditCount = after.fuel_records_audit;

  if (remainingMainData.length || (auditCount ?? 0) > 0) {
    const details = [
      remainingMainData.length ? `ยังมีข้อมูลใน ${remainingMainData.join(', ')}` : '',
      (auditCount ?? 0) > 0 ? `fuel_records_audit ยังเหลือ ${auditCount?.toLocaleString('th-TH')} รายการ` : '',
    ].filter(Boolean);
    return {
      ok: false as const,
      error: `${details.join('\n')}\nกรุณารัน migration 0010 เพื่อให้ล้างข้อมูลและประวัติการตรวจสอบได้ครบถ้วน`,
      before,
      after,
    };
  }

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  revalidatePath('/entry');
  revalidatePath('/history');
  return {
    ok: true as const,
    before,
    after,
    warning: after.fuel_records_audit === null ? 'ล้างข้อมูลหลักแล้ว แต่ไม่สามารถตรวจตาราง fuel_records_audit ได้' : undefined,
  };
}

export async function updateUserPermissions(formData: FormData) {
  await requireAdmin();

  const profileId = String(formData.get('profile_id') ?? '');
  const role = String(formData.get('role') ?? 'viewer');
  const stationIds = formData
    .getAll('station_ids')
    .map(String)
    .filter((stationId): stationId is StationId => STATION_IDS.includes(stationId as StationId));

  if (!profileId || !['admin', 'editor', 'viewer'].includes(role)) {
    return { ok: false as const, error: 'ข้อมูลไม่ถูกต้อง' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.id === profileId && role !== 'admin') {
    return { ok: false as const, error: 'ไม่สามารถลดสิทธิ์ตัวเองจาก admin ได้' };
  }

  const { error } = await supabase.rpc('admin_update_user_permissions', {
    target_profile_id: profileId,
    target_role: role,
    target_station_ids: stationIds,
  });

  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  revalidatePath('/entry');
  revalidatePath('/history');
  return { ok: true as const };
}

export async function createMember(formData: FormData) {
  await requireAdmin();

  const fullName = String(formData.get('full_name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const role = String(formData.get('role') ?? 'viewer');
  const stationIds = formData
    .getAll('station_ids')
    .map(String)
    .filter((stationId): stationId is StationId => STATION_IDS.includes(stationId as StationId));

  if (!email || !email.includes('@')) {
    return { ok: false as const, error: 'กรุณากรอกอีเมลให้ถูกต้อง' };
  }
  if (password.length < 8) {
    return { ok: false as const, error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' };
  }
  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return { ok: false as const, error: 'role ไม่ถูกต้อง' };
  }
  if (role !== 'admin' && stationIds.length === 0) {
    return { ok: false as const, error: 'กรุณาเลือกสถานีอย่างน้อย 1 แห่ง' };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      ok: false as const,
      error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน .env.local จึงสร้างสมาชิกจากแอปไม่ได้',
    };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (error || !data.user) {
    return { ok: false as const, error: error?.message ?? 'สร้างผู้ใช้ไม่สำเร็จ' };
  }

  const userId = data.user.id;
  const finalStationIds = role === 'admin' ? [...STATION_IDS] : stationIds;

  const { error: profileError } = await admin
    .from('profiles')
    .upsert({ id: userId, full_name: fullName || null, role }, { onConflict: 'id' });

  if (profileError) return { ok: false as const, error: profileError.message };

  await admin.from('profile_station_access').delete().eq('profile_id', userId);

  if (finalStationIds.length) {
    const { error: accessError } = await admin.from('profile_station_access').insert(
      finalStationIds.map((stationId) => ({
        profile_id: userId,
        station_id: stationId,
      }))
    );

    if (accessError) return { ok: false as const, error: accessError.message };
  }

  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  await admin.from('permission_audit').insert({
    target_profile_id: userId,
    changed_by: currentUser?.id ?? null,
    action: 'created',
    previous_role: null,
    new_role: role,
    previous_station_ids: [],
    new_station_ids: finalStationIds,
  });

  revalidatePath('/settings');
  return { ok: true as const, email };
}

export async function resetMemberPassword(profileId: string, password: string) {
  await requireAdmin();

  if (!profileId) return { ok: false as const, error: 'ไม่พบผู้ใช้' };
  if (password.length < 8) return { ok: false as const, error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false as const, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน .env.local จึงรีเซ็ตรหัสผ่านจากแอปไม่ได้' };
  }

  const { error } = await admin.auth.admin.updateUserById(profileId, { password });
  if (error) return { ok: false as const, error: error.message };

  return { ok: true as const };
}

export async function setMemberActive(profileId: string, active: boolean) {
  await requireAdmin();

  if (!profileId) return { ok: false as const, error: 'ไม่พบผู้ใช้' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === profileId && !active) {
    return { ok: false as const, error: 'ไม่สามารถปิดใช้งานบัญชีของตัวเองได้' };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false as const, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน .env.local จึงเปลี่ยนสถานะบัญชีจากแอปไม่ได้' };
  }

  const { error } = await admin.auth.admin.updateUserById(profileId, { ban_duration: active ? 'none' : '876000h' });
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/settings');
  return { ok: true as const };
}

const THAI_DIGITS: Record<string, string> = {
  '๐': '0',
  '๑': '1',
  '๒': '2',
  '๓': '3',
  '๔': '4',
  '๕': '5',
  '๖': '6',
  '๗': '7',
  '๘': '8',
  '๙': '9',
};

function normalizeDigits(value: string) {
  return value.replace(/[๐-๙]/g, (digit) => THAI_DIGITS[digit] ?? digit);
}

function parseNumber(value: string | number | undefined) {
  if (value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = normalizeDigits(value)
    .replace(/[,\s]/g, '')
    .replace(/[^\d().+-]/g, '')
    .trim();
  if (!normalized || normalized === '-' || normalized === '–' || normalized === '—') return 0;
  const isParenthesizedNegative = /^\(.+\)$/.test(normalized);
  const numericText = normalized.replace(/[()]/g, '');
  const parsed = Number(numericText);
  if (!Number.isFinite(parsed)) return NaN;
  return isParenthesizedNegative ? -parsed : parsed;
}

const MONTH_ALIASES: Record<string, string> = {
  jan: '01',
  january: '01',
  'ม.ค.': '01',
  มกราคม: '01',
  feb: '02',
  february: '02',
  'ก.พ.': '02',
  กุมภาพันธ์: '02',
  mar: '03',
  march: '03',
  'มี.ค.': '03',
  มีนาคม: '03',
  apr: '04',
  april: '04',
  'เม.ย.': '04',
  เมษายน: '04',
  may: '05',
  'พ.ค.': '05',
  พฤษภาคม: '05',
  jun: '06',
  june: '06',
  'มิ.ย.': '06',
  มิถุนายน: '06',
  jul: '07',
  july: '07',
  'ก.ค.': '07',
  กรกฎาคม: '07',
  aug: '08',
  august: '08',
  'ส.ค.': '08',
  สิงหาคม: '08',
  sep: '09',
  sept: '09',
  september: '09',
  'ก.ย.': '09',
  กันยายน: '09',
  oct: '10',
  october: '10',
  'ต.ค.': '10',
  ตุลาคม: '10',
  nov: '11',
  november: '11',
  'พ.ย.': '11',
  พฤศจิกายน: '11',
  dec: '12',
  december: '12',
  'ธ.ค.': '12',
  ธันวาคม: '12',
};

function normalizeYear(rawYear: string) {
  const year = Number(normalizeDigits(rawYear));
  if (!Number.isFinite(year)) return null;

  if (rawYear.length <= 2) {
    // Thai Excel files often show Buddhist year 2569 as "69".
    return year >= 43 ? 2500 + year - 543 : 2000 + year;
  }

  return year > 2400 ? year - 543 : year;
}

function toIsoDate(year: number, month: string, day: string) {
  const numericMonth = Number(month);
  const numericDay = Number(day);

  if (year < 1900 || year > 2200 || numericMonth < 1 || numericMonth > 12 || numericDay < 1 || numericDay > 31) {
    return null;
  }

  return `${year}-${String(numericMonth).padStart(2, '0')}-${String(numericDay).padStart(2, '0')}`;
}

function parseExcelSerialDate(value: number) {
  if (!Number.isFinite(value) || value < 1) return null;

  const excelEpoch = Date.UTC(1899, 11, 30);
  const date = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
  return toIsoDate(date.getUTCFullYear(), String(date.getUTCMonth() + 1), String(date.getUTCDate()));
}

function parseDate(value: string | number | Date | undefined) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDate(value.getFullYear(), String(value.getMonth() + 1), String(value.getDate()));
  }

  if (typeof value === 'number') return parseExcelSerialDate(value);

  if (typeof value !== 'string') return null;

  const raw = normalizeDigits(value.trim()).replace(/[,]+/g, ' ').replace(/\s+/g, ' ');
  if (!raw) return null;
  const isoMatch = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const normalizedYear = normalizeYear(year);
    return normalizedYear ? toIsoDate(normalizedYear, month, day) : null;
  }

  const serialDate = Number(raw);
  if (/^\d+(\.\d+)?$/.test(raw)) return parseExcelSerialDate(serialDate);

  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const [, first, second, year] = slashMatch;
    const normalizedYear = normalizeYear(year);
    if (!normalizedYear) return null;

    const firstNumber = Number(first);
    const secondNumber = Number(second);
    const day = firstNumber > 12 ? first : secondNumber > 12 ? second : first;
    const month = firstNumber > 12 ? second : secondNumber > 12 ? first : second;
    return toIsoDate(normalizedYear, month, day);
  }

  const monthNameMatch = raw.match(/^(\d{1,2})[\s/-]+([A-Za-z.ก-๙]+)[\s/-]+(\d{2,4})$/);
  if (monthNameMatch) {
    const [, day, monthName, year] = monthNameMatch;
    const month = MONTH_ALIASES[monthName.toLowerCase()];
    const normalizedYear = normalizeYear(year);
    return month && normalizedYear ? toIsoDate(normalizedYear, month, day) : null;
  }

  const monthFirstMatch = raw.match(/^([A-Za-z.ก-๙]+)[\s/-]+(\d{1,2})[\s/-]+(\d{2,4})$/);
  if (monthFirstMatch) {
    const [, monthName, day, year] = monthFirstMatch;
    const month = MONTH_ALIASES[monthName.toLowerCase()];
    const normalizedYear = normalizeYear(year);
    return month && normalizedYear ? toIsoDate(normalizedYear, month, day) : null;
  }

  return null;
}

function normalizeStationId(value: string | undefined): StationId | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) return null;

  if (STATION_IDS.includes(raw as StationId)) return raw as StationId;
  if (['samui', 'เกาะสมุย', 'สมุย', 'สถานีไฟฟ้าสมุย 1 (บ้านพังกา)', 'บ้านพังกา'].includes(raw)) return 'samui';
  if (
    [
      'phangan',
      'pha ngan',
      'koh phangan',
      'เกาะพะงัน',
      'พะงัน',
      'ลิปะน้อย',
      'พื้นที่ติดตั้งเครื่องกำเนิดไฟฟ้าชั่วคราว ต.ลิปะน้อย',
      'ต.ลิปะน้อย',
    ].includes(raw)
  )
    return 'phangan';
  if (['koh_tao', 'koh tao', 'tao', 'เกาะเต่า', 'เต่า', 'โรงจักร เกาะเต่า', 'โรงจักร'].includes(raw)) return 'koh_tao';

  return null;
}

function normalizeExportStationId(row: DatabaseExportRow): StationId | null {
  const rawSiteId = String(row.site_id ?? '').trim();
  const rawSiteCode = String(row.site_code ?? '').trim().toLowerCase();

  if (rawSiteId === '1' || rawSiteCode === 'koh_tao') return 'koh_tao';
  if (rawSiteId === '2' || rawSiteCode === 'lipa_noi' || rawSiteCode === 'phangan') return 'phangan';
  if (rawSiteId === '3' || rawSiteCode === 'kmo_1' || rawSiteCode === 'samui') return 'samui';

  return normalizeStationId(String(row.station_id ?? row.station ?? row.site_name_th ?? ''));
}

function parseOptionalDate(value: string | number | Date | undefined) {
  if (value === undefined || value === '') return null;
  return parseDate(value);
}

function parseOptionalTimestamp(value: string | number | Date | undefined) {
  if (value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseDispenseDetail(value: string | number | undefined) {
  if (typeof value !== 'string' || !value.trim()) return { namsaeng: 0, kfp: 0 };
  try {
    const detail = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(detail).reduce(
      (acc, [key, rawValue]) => {
        const normalizedKey = key.toLowerCase();
        const numericValue = parseNumber(String(rawValue ?? ''));
        if (normalizedKey.includes('นำแสง') || normalizedKey.includes('namsaeng')) {
          acc.namsaeng = numericValue;
        }
        if (normalizedKey.includes('กฟภ') || normalizedKey.includes('kfp') || normalizedKey.includes('เครื่อง')) {
          acc.kfp = numericValue;
        }
        return acc;
      },
      { namsaeng: 0, kfp: 0 }
    );
  } catch {
    return { namsaeng: 0, kfp: 0 };
  }
}

export async function importFuelRecords(
  rows: ImportFuelRecordRow[],
  sourceFileName?: string,
  recordSource: 'upload' | 'database' = 'upload'
) {
  await requireAdmin();

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false as const, error: 'ไม่พบข้อมูลในไฟล์' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;

  if (!uid) return { ok: false as const, error: 'ไม่ได้เข้าสู่ระบบ' };

  const errors: string[] = [];
  const payload = rows.flatMap((row, index) => {
    const rowNo = index + 2;
    const stationId = normalizeStationId(row.station_id ?? row.station);
    const recordDate = parseDate(row.record_date);
    const employeeCode = String(row.employee_code ?? '').trim() || 'IMPORT';

    if (!stationId) {
      errors.push(`แถว ${rowNo}: ไม่พบ station_id ที่ถูกต้อง`);
      return [];
    }
    if (!recordDate) {
      errors.push(`แถว ${rowNo}: วันที่ไม่ถูกต้อง`);
      return [];
    }

    const received_liters = parseNumber(row.received_liters);
    const available_liters = row.available_liters === undefined ? undefined : parseNumber(row.available_liters);
    const opening_liters =
      row.opening_liters === undefined && available_liters !== undefined && !Number.isNaN(available_liters)
        ? Math.max(available_liters - received_liters, 0)
        : parseNumber(row.opening_liters);
    const plan_received_liters = parseNumber(row.plan_received_liters);
    const dispatched_namsaeng = row.dispatched_namsaeng === undefined ? undefined : parseNumber(row.dispatched_namsaeng);
    const dispatched_kfp = row.dispatched_kfp === undefined ? undefined : parseNumber(row.dispatched_kfp);
    const importedClosing = row.closing_liters === undefined ? undefined : parseNumber(row.closing_liters);
    const computedDispatchedFromClosing =
      importedClosing === undefined || Number.isNaN(importedClosing)
        ? undefined
        : opening_liters + received_liters - importedClosing;
    const importedDispatched =
      row.dispatched_liters === undefined && computedDispatchedFromClosing !== undefined
        ? computedDispatchedFromClosing
        : parseNumber(row.dispatched_liters);
    const dispatched_liters =
      stationId === 'koh_tao' && row.dispatched_liters === undefined && computedDispatchedFromClosing === undefined
        ? (dispatched_namsaeng ?? 0) + (dispatched_kfp ?? 0)
        : importedDispatched;

    const numericValues = [
      opening_liters,
      received_liters,
      plan_received_liters,
      dispatched_liters,
      dispatched_namsaeng ?? 0,
      dispatched_kfp ?? 0,
    ];

    if (numericValues.some((value) => Number.isNaN(value) || value < 0)) {
      errors.push(`แถว ${rowNo}: จำนวนลิตรต้องเป็นตัวเลขไม่ติดลบ`);
      return [];
    }

    const computedClosing = computeClosing({
      station_id: stationId,
      opening_liters,
      received_liters,
      dispatched_liters,
      dispatched_namsaeng,
      dispatched_kfp,
    });
    const closing_liters = importedClosing === undefined || Number.isNaN(importedClosing) ? computedClosing : importedClosing;

    return [
      {
        station_id: stationId,
        record_date: recordDate,
        opening_liters,
        received_liters,
        plan_received_liters,
        dispatched_liters,
        dispatched_namsaeng: stationId === 'koh_tao' ? dispatched_namsaeng ?? 0 : null,
        dispatched_kfp: stationId === 'koh_tao' ? dispatched_kfp ?? 0 : null,
        closing_liters,
        employee_code: employeeCode,
        record_source: recordSource,
        source_file_name: sourceFileName?.trim() || null,
        source_sheet_name: row.source_sheet_name?.trim() || null,
        source_note: recordSource === 'database' ? 'historical_database_import' : 'settings_import',
        note: row.note?.trim() || null,
        created_by: uid,
        updated_by: uid,
      },
    ];
  });

  if (errors.length) {
    return { ok: false as const, error: errors.slice(0, 10).join('\n') };
  }

  // นำเข้าแบบ idempotent: ลบแถวนำเข้าเดิมของ (สถานี, วันที่) เดียวกันก่อน แล้ว insert ใหม่
  // — แตะเฉพาะแถวที่มาจากการนำเข้า (upload/database) ไม่กระทบรายการที่พนักงานกรอกหลายเที่ยวต่อวัน
  // (แทน upsert เดิมซึ่งพึ่ง unique constraint ที่ถูกถอดใน migration 0018)
  const datesByStation = new Map<string, Set<string>>();
  for (const row of payload) {
    const dates = datesByStation.get(row.station_id) ?? new Set<string>();
    dates.add(row.record_date);
    datesByStation.set(row.station_id, dates);
  }
  for (const [stationId, dates] of datesByStation) {
    const { error: cleanupError } = await supabase
      .from('fuel_records')
      .delete()
      .eq('station_id', stationId)
      .in('record_date', [...dates])
      .in('record_source', ['upload', 'database']);
    if (cleanupError) return { ok: false as const, error: cleanupError.message };
  }

  const { error } = await supabase.from('fuel_records').insert(payload);
  if (error) {
    if (error.message.includes('employee_code')) {
      return {
        ok: false as const,
        error:
          'ฐานข้อมูลจริงยังไม่มีคอลัมน์ employee_code กรุณารัน migration 0005_add_employee_code_to_fuel_records.sql ใน Supabase SQL Editor ก่อนนำเข้า',
      };
    }
    if (error.message.includes('record_source') || error.message.includes('source_file_name') || error.message.includes('source_sheet_name')) {
      return {
        ok: false as const,
        error:
          'ฐานข้อมูลจริงยังไม่มีคอลัมน์สถานะแหล่งที่มา กรุณารัน migration 0007 และ 0008 ใน Supabase SQL Editor ก่อนนำเข้า',
      };
    }

    return { ok: false as const, error: error.message };
  }

  revalidatePath('/settings');
  revalidatePath('/dashboard');
  revalidatePath('/entry');
  revalidatePath('/history');
  return { ok: true as const, imported: payload.length };
}

export async function importDatabaseExportRows(kind: DatabaseExportKind, rows: DatabaseExportRow[], sourceFileName?: string) {
  await requireAdmin();

  if (!EXPORT_KIND_LABEL[kind]) {
    return { ok: false as const, error: 'ประเภทไฟล์นำเข้าไม่ถูกต้อง' };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false as const, error: 'ไม่พบข้อมูลในไฟล์' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id;

  if (!uid) return { ok: false as const, error: 'ไม่ได้เข้าสู่ระบบ' };

  if (kind === 'sites') {
    const unmappedRows = rows
      .map((row, index) => ({ rowNo: index + 2, stationId: normalizeExportStationId(row) }))
      .filter((row) => !row.stationId);

    if (unmappedRows.length) {
      return {
        ok: false as const,
        error: unmappedRows
          .slice(0, 10)
          .map((row) => `แถว ${row.rowNo}: map site เป็นสถานีในระบบไม่ได้`)
          .join('\n'),
      };
    }

    return { ok: true as const, imported: rows.length };
  }

  if (kind === 'daily_fuel_balance') {
    const errors: string[] = [];
    const payload = rows.flatMap((row, index) => {
      const rowNo = index + 2;
      const stationId = normalizeExportStationId(row);
      const recordDate = parseDate(row.record_date);
      const detail = parseDispenseDetail(row.dispense_detail_json);

      if (!stationId) {
        errors.push(`แถว ${rowNo}: map site_id เป็นสถานีในระบบไม่ได้`);
        return [];
      }
      if (!recordDate) {
        errors.push(`แถว ${rowNo}: วันที่ไม่ถูกต้อง`);
        return [];
      }

      const opening_liters = parseNumber(row.opening_balance_liters);
      const received_liters = parseNumber(row.received_liters);
      const plan_received_liters = parseNumber(row.planned_receive_liters);
      const dispatched_liters = parseNumber(row.dispensed_total_liters);
      const closing_liters = parseNumber(row.closing_balance_liters);
      const numericValues = [opening_liters, received_liters, plan_received_liters, dispatched_liters, closing_liters, detail.namsaeng, detail.kfp];

      if (numericValues.some((value) => Number.isNaN(value) || value < 0)) {
        errors.push(`แถว ${rowNo}: ตัวเลขไม่ถูกต้องหรือติดลบ`);
        return [];
      }

      return [
        {
          station_id: stationId,
          record_date: recordDate,
          opening_liters,
          received_liters,
          plan_received_liters,
          dispatched_liters,
          dispatched_namsaeng: stationId === 'koh_tao' ? detail.namsaeng : null,
          dispatched_kfp: stationId === 'koh_tao' ? detail.kfp : null,
          closing_liters,
          employee_code: 'DATABASE',
          record_source: 'database',
          source_file_name: String(row.source_file ?? sourceFileName ?? '').trim() || null,
          source_sheet_name: 'daily_fuel_balance.csv',
          source_note: String(row.source_file_id ?? '').trim() || 'database_export',
          note: String(row.vehicle_plate ?? '').trim() || null,
          created_by: uid,
          updated_by: uid,
        },
      ];
    });

    if (errors.length) return { ok: false as const, error: errors.slice(0, 10).join('\n') };
    if (!payload.length) return { ok: false as const, error: 'ไม่พบ record ที่พร้อมนำเข้า' };

    // idempotent เช่นเดียวกับ importFuelRecords: ลบแถวนำเข้าเดิมของ (สถานี, วันที่) เดียวกันก่อน insert
    const datesByStation = new Map<string, Set<string>>();
    for (const row of payload) {
      const dates = datesByStation.get(row.station_id) ?? new Set<string>();
      dates.add(row.record_date);
      datesByStation.set(row.station_id, dates);
    }
    for (const [stationId, dates] of datesByStation) {
      const { error: cleanupError } = await supabase
        .from('fuel_records')
        .delete()
        .eq('station_id', stationId)
        .in('record_date', [...dates])
        .in('record_source', ['upload', 'database']);
      if (cleanupError) return { ok: false as const, error: cleanupError.message };
    }

    const { error } = await supabase.from('fuel_records').insert(payload);
    if (error) return { ok: false as const, error: error.message };

    revalidatePath('/settings');
    revalidatePath('/dashboard');
    revalidatePath('/history');
    return { ok: true as const, imported: payload.length };
  }

  if (kind === 'fuel_contracts') {
    const payload = rows.map((row) => ({
      contract_code: String(row.contract_code ?? '').trim(),
      document_no: String(row.document_no ?? '').trim() || null,
      contract_date_th: String(row.contract_date_th ?? '').trim() || null,
      contract_date: parseOptionalDate(row.contract_date),
      quantity_liters: parseNumber(row.quantity_liters),
      notes: String(row.notes ?? '').trim() || null,
      source_file_name: sourceFileName?.trim() || EXPORT_KIND_LABEL[kind],
      imported_by: uid,
    }));
    const validPayload = payload.filter((row) => row.contract_code && Number.isFinite(row.quantity_liters) && row.quantity_liters >= 0);
    if (!validPayload.length) return { ok: false as const, error: 'ไม่พบ contract_code ในไฟล์' };

    const { error } = await supabase.from('fuel_contracts').upsert(validPayload, { onConflict: 'contract_code,document_no' });
    if (error) return { ok: false as const, error: `${error.message} (ตรวจสอบว่าได้รัน migration 0009 แล้ว)` };
    revalidatePath('/settings');
    return { ok: true as const, imported: validPayload.length };
  }

  if (kind === 'delivery_plan_log') {
    const errors: string[] = [];
    const payload = rows.flatMap((row, index) => {
      const stationId = normalizeExportStationId(row);
      const snapshotDate = parseDate(row.snapshot_date);
      if (!stationId) {
        errors.push(`แถว ${index + 2}: map site_id เป็นสถานีในระบบไม่ได้`);
        return [];
      }
      if (!snapshotDate) {
        errors.push(`แถว ${index + 2}: snapshot_date ไม่ถูกต้อง`);
        return [];
      }

      return [
        {
          station_id: stationId,
          batch_no: String(row.batch_no ?? '').trim(),
          day_name: String(row.day_name ?? '').trim() || null,
          delivery_date: parseOptionalDate(row.delivery_date),
          delivery_date_raw_text: String(row.delivery_date_raw_text ?? '').trim(),
          plan_liters: parseNumber(row.plan_liters),
          cumulative_liters: parseNumber(row.cumulative_liters),
          remaining_liters: parseNumber(row.remaining_liters),
          contract_code: String(row.contract_code ?? '').trim() || null,
          source_file: String(row.source_file ?? sourceFileName ?? '').trim() || EXPORT_KIND_LABEL[kind],
          snapshot_date: snapshotDate,
          imported_by: uid,
        },
      ];
    }).filter((row) => row.batch_no);

    if (errors.length) return { ok: false as const, error: errors.slice(0, 10).join('\n') };
    if (!payload.length) return { ok: false as const, error: 'ไม่พบ record ที่พร้อมนำเข้า' };

    const { error } = await supabase
      .from('delivery_plan_log')
      .upsert(payload, { onConflict: 'station_id,batch_no,delivery_date_raw_text,source_file,snapshot_date' });
    if (error) return { ok: false as const, error: `${error.message} (ตรวจสอบว่าได้รัน migration 0009 แล้ว)` };
    revalidatePath('/settings');
    return { ok: true as const, imported: payload.length };
  }

  if (kind === 'monthly_summary') {
    const errors: string[] = [];
    const payload = rows.flatMap((row, index) => {
      const stationId = normalizeExportStationId(row);
      const year_be = Number(row.year_be);
      const month_num = Number(row.month_num);
      if (!stationId) {
        errors.push(`แถว ${index + 2}: map site_id เป็นสถานีในระบบไม่ได้`);
        return [];
      }
      if (!Number.isFinite(year_be) || !Number.isFinite(month_num)) {
        errors.push(`แถว ${index + 2}: year_be หรือ month_num ไม่ถูกต้อง`);
        return [];
      }
      return [
        {
          station_id: stationId,
          year_be,
          month_num,
          month_label: String(row.month_label ?? '').trim() || null,
          received_liters: parseNumber(row.received_liters),
          dispensed_liters: parseNumber(row.dispensed_liters),
          source: String(row.source ?? '').trim() || null,
          source_file_name: sourceFileName?.trim() || EXPORT_KIND_LABEL[kind],
          imported_by: uid,
        },
      ];
    });

    if (errors.length) return { ok: false as const, error: errors.slice(0, 10).join('\n') };
    if (!payload.length) return { ok: false as const, error: 'ไม่พบ record ที่พร้อมนำเข้า' };

    const { error } = await supabase
      .from('monthly_import_summaries')
      .upsert(payload, { onConflict: 'station_id,year_be,month_num' });
    if (error) return { ok: false as const, error: `${error.message} (ตรวจสอบว่าได้รัน migration 0009 แล้ว)` };
    revalidatePath('/settings');
    return { ok: true as const, imported: payload.length };
  }

  const errors: string[] = [];
  const payload = rows.flatMap((row, index) => {
    const stationId = normalizeExportStationId(row);
    const fileName = String(row.file_name ?? '').trim();
    if (!fileName) {
      errors.push(`แถว ${index + 2}: ไม่พบ file_name`);
      return [];
    }

    return [
      {
        station_id: stationId,
        folder_path: String(row.folder_path ?? '').trim() || null,
        file_name: fileName,
        file_type: String(row.file_type ?? '').trim() || null,
        status: String(row.status ?? '').trim() || null,
        note: String(row.note ?? '').trim() || null,
        modified_time: parseOptionalTimestamp(row.modified_time),
        drive_file_id: String(row.drive_file_id ?? '').trim() || null,
        imported_by: uid,
      },
    ];
  });

  if (errors.length) return { ok: false as const, error: errors.slice(0, 10).join('\n') };
  if (!payload.length) return { ok: false as const, error: 'ไม่พบ record ที่พร้อมนำเข้า' };

  const { error } = await supabase
    .from('import_file_manifest')
    .upsert(payload, { onConflict: 'station_id,file_name,drive_file_id' });
  if (error) return { ok: false as const, error: `${error.message} (ตรวจสอบว่าได้รัน migration 0009 แล้ว)` };
  revalidatePath('/settings');
  return { ok: true as const, imported: payload.length };
}
