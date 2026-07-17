import { createClient } from '@/lib/supabase/server';
import { STATION_IDS, STATION_LABEL, type FuelRecord } from '@/lib/types/domain';
import Link from 'next/link';
import { DeleteButton } from './delete-button';
import { EditRecordButton } from './edit-record-button';
import { RecordDocuments } from './record-documents';
import { getCurrentUserAccess, requirePageAccess } from '@/lib/auth/server';

export const revalidate = 0;

type ProfileLite = {
  id: string;
  full_name: string | null;
};
type RecordCheck = {
  id: string;
  level: 'error' | 'warning';
  message: string;
};
const CHECK_TOLERANCE_LITERS = 1;

function sourceLabel(record: FuelRecord) {
  if (record.record_source === 'upload') return 'อัปโหลดไฟล์';
  if (record.record_source === 'database') return 'ฐานข้อมูลย้อนหลัง';
  return 'กรอกโดยพนักงาน';
}

function sourceClass(record: FuelRecord) {
  if (record.record_source === 'upload') return 'border-sky-200 bg-sky-50 text-sky-800';
  if (record.record_source === 'database') return 'border-slate-200 bg-slate-50 text-slate-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-800';
}

function reporterText(record: FuelRecord, profileMap: Map<string, string>) {
  const profileName = record.created_by ? profileMap.get(record.created_by) : null;
  const employeeCode = record.employee_code || '-';
  if (profileName) return `${profileName} / ${employeeCode}`;
  return employeeCode;
}

// เวลาที่บันทึกจริง (และเวลาแก้ไขล่าสุดถ้ามี) — ใช้แยกลำดับหลายเที่ยวในวันเดียวกัน
function recordedAtText(record: FuelRecord) {
  if (!record.created_at) return '-';
  const format = (value: string) =>
    new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  const created = format(record.created_at);
  const edited = record.updated_at && record.updated_at !== record.created_at ? ` (แก้ไข ${format(record.updated_at)})` : '';
  return `${created}${edited}`;
}

function checkHistoryRecords(records: FuelRecord[]) {
  const checks: RecordCheck[] = [];
  const recordsByStation = new Map<string, FuelRecord[]>();
  // ระบุพื้นที่+วันที่ในทุกข้อความเตือน — ให้หาแถวที่มีปัญหาเจอทันที
  const where = (record: FuelRecord) => `${STATION_LABEL[record.station_id]} วันที่ ${record.record_date}`;

  records.forEach((record) => {
    const namsaeng = record.dispatched_namsaeng ?? 0;
    const kfp = record.dispatched_kfp ?? 0;
    const totalDispatched = record.station_id === 'koh_tao' && (namsaeng || kfp) ? namsaeng + kfp : record.dispatched_liters;
    const expectedClosing = record.opening_liters + record.received_liters - totalDispatched;

    if (
      [
        record.opening_liters,
        record.received_liters,
        record.plan_received_liters,
        record.dispatched_liters,
        record.closing_liters,
        namsaeng,
        kfp,
      ].some((value) => value < 0)
    ) {
      checks.push({ id: record.id, level: 'error', message: `${where(record)}: มีค่าติดลบ` });
    }

    if (Math.abs(record.closing_liters - expectedClosing) > CHECK_TOLERANCE_LITERS) {
      checks.push({
        id: record.id,
        level: 'error',
        message: `${where(record)}: คงเหลือไม่ตรง ควรเป็น ${Math.round(expectedClosing).toLocaleString('th-TH')} ลิตร`,
      });
    }

    if (record.station_id === 'koh_tao' && record.dispatched_liters && Math.abs(record.dispatched_liters - (namsaeng + kfp)) > CHECK_TOLERANCE_LITERS) {
      checks.push({ id: record.id, level: 'warning', message: `${where(record)}: ยอดจ่ายรวมไม่ตรงกับนำแสง+กฟภ.` });
    }

    const stationRecords = recordsByStation.get(record.station_id) ?? [];
    stationRecords.push(record);
    recordsByStation.set(record.station_id, stationRecords);
  });

  recordsByStation.forEach((stationRecords) => {
    stationRecords
      // 1 วันมีได้หลายเที่ยว — เทียบความต่อเนื่องตาม (วันที่, เวลาที่บันทึก) ของสถานีเดียวกัน
      .sort((a, b) => a.record_date.localeCompare(b.record_date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
      .forEach((record, index, sortedRecords) => {
        const previous = sortedRecords[index - 1];
        if (!previous) return;
        if (Math.abs(record.opening_liters - previous.closing_liters) > CHECK_TOLERANCE_LITERS) {
          checks.push({
            id: record.id,
            level: 'warning',
            message: `${where(record)}: ยอดยกมา ${Math.round(record.opening_liters).toLocaleString('th-TH')} ไม่ตรงกับคงเหลือรายการก่อนหน้า ${Math.round(previous.closing_liters).toLocaleString('th-TH')} (${previous.record_date})`,
          });
        }
      });
  });

  return checks;
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  const role = await requirePageAccess('history');
  const access = await getCurrentUserAccess();

  const supabase = await createClient();
  const { station: stationFilter } = await searchParams;

  let query = supabase
    .from('fuel_records')
    .select('*')
    .order('record_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (stationFilter) query = query.eq('station_id', stationFilter);

  const { data } = await query;
  const records = (data ?? []) as FuelRecord[];
  const profileIds = Array.from(new Set(records.flatMap((record) => [record.created_by, record.updated_by]).filter(Boolean))) as string[];
  const [{ data: profiles }, { data: documentRows }] = await Promise.all([
    profileIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', profileIds)
      : Promise.resolve({ data: [] as ProfileLite[] }),
    supabase.from('fuel_record_documents').select('record_id'),
  ]);
  const profileMap = new Map((profiles ?? []).map((profile: ProfileLite) => [profile.id, profile.full_name ?? profile.id]));
  const documentCounts = new Map<string, number>();
  for (const row of documentRows ?? []) {
    const recordId = row.record_id as string;
    documentCounts.set(recordId, (documentCounts.get(recordId) ?? 0) + 1);
  }
  const recordChecks = checkHistoryRecords(records);
  const checkMap = new Map<string, RecordCheck[]>();
  recordChecks.forEach((check) => {
    checkMap.set(check.id, [...(checkMap.get(check.id) ?? []), check]);
  });
  const errorCount = recordChecks.filter((check) => check.level === 'error').length;
  const warningCount = recordChecks.filter((check) => check.level === 'warning').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="page-kicker">History</div>
          <h1 className="page-title">ประวัติข้อมูลทั้งหมด</h1>
          <p className="page-subtitle">ค้นหาและกรองข้อมูลการใช้น้ำมันย้อนหลัง พร้อมรหัสพนักงานผู้รายงาน</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
          แสดง {records.length.toLocaleString('th-TH')} รายการ
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link href="/history" className={`chip ${!stationFilter ? 'chip-active' : ''}`}>
          ทั้งหมด
        </Link>
        {STATION_IDS.map((id) => (
          <Link key={id} href={`/history?station=${id}`} className={`chip ${stationFilter === id ? 'chip-active' : ''}`}>
            {STATION_LABEL[id]}
          </Link>
        ))}
      </div>

      {records.length > 0 && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            errorCount > 0
              ? 'border-red-200 bg-red-50 text-red-800'
              : warningCount > 0
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          <div className="font-extrabold">
            {errorCount > 0
              ? `พบตัวเลขผิดปกติ ${errorCount.toLocaleString('th-TH')} จุด`
              : warningCount > 0
                ? `มีจุดที่ควรตรวจสอบ ${warningCount.toLocaleString('th-TH')} จุด`
                : 'ทวนสอบตัวเลขแล้ว ไม่พบความผิดปกติ'}
          </div>
          {recordChecks.length > 0 && (
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
              {recordChecks.slice(0, 8).map((check, index) => (
                <li key={`${check.id}-${index}`}>{check.message}</li>
              ))}
              {recordChecks.length > 8 && <li>และอีก {(recordChecks.length - 8).toLocaleString('th-TH')} จุด</li>}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-3 md:hidden">
        {records.length === 0 && (
          <div className="panel py-10 text-center text-sm text-slate-500">ไม่พบข้อมูล</div>
        )}
        {records.map((r) => {
          const issues = checkMap.get(r.id) ?? [];
          const hasError = issues.some((issue) => issue.level === 'error');
          return (
          <article key={r.id} className={`panel space-y-3 ${hasError ? 'border-red-200 bg-red-50' : issues.length ? 'border-amber-200 bg-amber-50' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-brand-700">{r.record_date}</div>
                <h2 className="mt-0.5 text-sm font-extrabold leading-5 text-slate-950">{STATION_LABEL[r.station_id]}</h2>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-extrabold ${sourceClass(r)}`}>
                    {sourceLabel(r)}
                  </span>
                  {r.source_file_name && (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600">
                      {r.source_file_name}
                    </span>
                  )}
                  {r.source_sheet_name && (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600">
                      {r.source_sheet_name}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-500">ผู้รายงาน {reporterText(r, profileMap)}</div>
                <div className="mt-0.5 text-xs text-slate-400">บันทึกเมื่อ {recordedAtText(r)}</div>
              </div>
              <div className="flex shrink-0 gap-2">
                <RecordDocuments recordId={r.id} count={documentCounts.get(r.id) ?? 0} canEdit={role !== 'viewer'} />
                {role !== 'viewer' && <EditRecordButton record={r} allowedStationIds={access.stationIds} />}
                {role === 'admin' && <DeleteButton id={r.id} />}
              </div>
            </div>

            {issues.length > 0 && (
              <div className={`rounded-md px-3 py-2 text-xs font-semibold ${hasError ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                {issues.map((issue) => issue.message).join(' | ')}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md bg-slate-50 p-2">
                <div className="text-xs font-bold text-slate-500">ยกมา</div>
                <div className="font-extrabold tabular-nums text-slate-950">{Math.round(r.opening_liters).toLocaleString('th-TH')}</div>
              </div>
              <div className="rounded-md bg-slate-50 p-2">
                <div className="text-xs font-bold text-slate-500">รับ</div>
                <div className="font-extrabold tabular-nums text-slate-950">{Math.round(r.received_liters).toLocaleString('th-TH')}</div>
              </div>
              <div className="rounded-md bg-amber-50 p-2">
                <div className="text-xs font-bold text-amber-700">ใช้/จ่าย</div>
                <div className="font-extrabold tabular-nums text-amber-900">{Math.round(r.dispatched_liters).toLocaleString('th-TH')}</div>
              </div>
              <div className="rounded-md bg-brand-50 p-2">
                <div className="text-xs font-bold text-brand-700">คงเหลือ</div>
                <div className="font-extrabold tabular-nums text-brand-900">{Math.round(r.closing_liters).toLocaleString('th-TH')}</div>
              </div>
            </div>

            {r.note && <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">{r.note}</p>}
          </article>
          );
        })}
      </div>

      <div className="table-shell hidden md:block">
        <table className="w-full min-w-[1460px] text-sm">
          <thead>
            <tr className="table-header">
              <th className="text-left px-3.5 py-2.5">วันที่</th>
              <th className="text-left px-3.5 py-2.5">พื้นที่</th>
              <th className="text-right px-3.5 py-2.5">ยกมา</th>
              <th className="text-right px-3.5 py-2.5">รับ</th>
              <th className="text-right px-3.5 py-2.5">ใช้/จ่าย</th>
              <th className="text-right px-3.5 py-2.5">คงเหลือ</th>
              <th className="text-left px-3.5 py-2.5">สถานะข้อมูล</th>
              <th className="text-left px-3.5 py-2.5">รหัสพนักงาน</th>
              <th className="text-left px-3.5 py-2.5">บันทึกเมื่อ</th>
              <th className="text-left px-3.5 py-2.5">หมายเหตุ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center py-10 text-slate-500">
                  ไม่พบข้อมูล
                </td>
              </tr>
            )}
            {records.map((r) => {
              const issues = checkMap.get(r.id) ?? [];
              const hasError = issues.some((issue) => issue.level === 'error');
              return (
              <tr key={r.id} className={`border-b border-slate-200 last:border-0 hover:bg-slate-50 ${hasError ? 'bg-red-50' : issues.length ? 'bg-amber-50' : ''}`}>
                <td className="px-3.5 py-2.5 tabular-nums whitespace-nowrap">{r.record_date}</td>
                <td className="px-3.5 py-2.5 whitespace-nowrap">{STATION_LABEL[r.station_id]}</td>
                <td className="px-3.5 py-2.5 text-right tabular-nums">{Math.round(r.opening_liters).toLocaleString('th-TH')}</td>
                <td className="px-3.5 py-2.5 text-right tabular-nums">{Math.round(r.received_liters).toLocaleString('th-TH')}</td>
                <td className="px-3.5 py-2.5 text-right tabular-nums">{Math.round(r.dispatched_liters).toLocaleString('th-TH')}</td>
                <td className="px-3.5 py-2.5 text-right tabular-nums">{Math.round(r.closing_liters).toLocaleString('th-TH')}</td>
                <td className="px-3.5 py-2.5">
                  <div className="space-y-1">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-extrabold ${sourceClass(r)}`}>
                      {sourceLabel(r)}
                    </span>
                    {r.source_file_name && <div className="max-w-40 truncate text-xs text-slate-500">{r.source_file_name}</div>}
                    {r.source_sheet_name && <div className="max-w-40 truncate text-xs text-slate-500">Sheet: {r.source_sheet_name}</div>}
                  </div>
                </td>
                <td className="px-3.5 py-2.5 whitespace-nowrap font-semibold text-slate-700">{reporterText(r, profileMap)}</td>
                <td className="px-3.5 py-2.5 whitespace-nowrap text-xs tabular-nums text-slate-500">{recordedAtText(r)}</td>
                <td className="px-3.5 py-2.5">
                  <div>{r.note || '-'}</div>
                  {issues.length > 0 && (
                    <div className={`mt-1 text-xs font-semibold ${hasError ? 'text-red-700' : 'text-amber-700'}`}>
                      {issues.map((issue) => issue.message).join(' | ')}
                    </div>
                  )}
                </td>
                <td className="px-3.5 py-2.5">
                  <div className="flex justify-end gap-2">
                    <RecordDocuments recordId={r.id} count={documentCounts.get(r.id) ?? 0} canEdit={role !== 'viewer'} />
                    {role !== 'viewer' && <EditRecordButton record={r} allowedStationIds={access.stationIds} />}
                    {role === 'admin' && <DeleteButton id={r.id} />}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
