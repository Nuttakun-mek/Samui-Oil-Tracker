'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import { importFuelRecords } from './actions';
import { STATION_IDS, STATION_LABEL, type StationId } from '@/lib/types/domain';

type ParsedRow = Record<string, string>;
type SheetSummary = {
  name: string;
  rows: number;
  status: 'ready' | 'skipped';
};
type ParsedFile = {
  rows: ParsedRow[];
  sheets: SheetSummary[];
};
type ImportCheck = {
  rowIndex: number;
  level: 'error' | 'warning';
  message: string;
};

const REQUIRED_COLUMNS = ['station_id', 'record_date'];
const OPTIONAL_COLUMNS = [
  'opening_liters',
  'received_liters',
  'plan_received_liters',
  'available_liters',
  'dispatched_liters',
  'dispatched_namsaeng',
  'dispatched_kfp',
  'closing_liters',
  'employee_code',
  'source_sheet_name',
  'note',
];
const EDITABLE_COLUMNS = REQUIRED_COLUMNS.concat(OPTIONAL_COLUMNS);
const COLUMN_LABELS: Record<string, string> = {
  station_id: 'พื้นที่',
  record_date: 'วันที่',
  opening_liters: 'ยอดยกมา',
  received_liters: 'รับจริง',
  plan_received_liters: 'แผนรับ',
  available_liters: 'รับจริง + ยอดยกมา',
  dispatched_liters: 'ยอดจ่าย',
  dispatched_namsaeng: 'นำแสง',
  dispatched_kfp: 'กฟภ.',
  closing_liters: 'คงเหลือ',
  employee_code: 'รหัสพนักงาน',
  source_sheet_name: 'Sheet',
  note: 'หมายเหตุ',
};
const CHECK_TOLERANCE_LITERS = 1;

const HEADER_ALIAS_PAIRS: Array<[string, string]> = [
  ['station', 'station_id'],
  ['station_id', 'station_id'],
  ['station id', 'station_id'],
  ['พื้นที่', 'station_id'],
  ['สถานที่', 'station_id'],
  ['สถานี', 'station_id'],
  ['เกาะ', 'station_id'],
  ['date', 'record_date'],
  ['record_date', 'record_date'],
  ['record date', 'record_date'],
  ['วันที่', 'record_date'],
  ['วัน', 'record_date'],
  ['opening', 'opening_liters'],
  ['opening_liters', 'opening_liters'],
  ['opening liters', 'opening_liters'],
  ['ยอดยกมา', 'opening_liters'],
  ['ยอดคงเหลือยกมา', 'opening_liters'],
  ['ยกมา', 'opening_liters'],
  ['ยอดยกมา ลิตร', 'opening_liters'],
  ['received', 'received_liters'],
  ['received_liters', 'received_liters'],
  ['received liters', 'received_liters'],
  ['รับ', 'received_liters'],
  ['รับจริง', 'received_liters'],
  ['รับน้ำมันเพิ่มจากปตท', 'received_liters'],
  ['รับจริง ลิตร', 'received_liters'],
  ['รับเข้า', 'received_liters'],
  ['plan_received', 'plan_received_liters'],
  ['plan_received_liters', 'plan_received_liters'],
  ['แผนรับ', 'plan_received_liters'],
  ['แผนการรับน้ำมัน', 'plan_received_liters'],
  ['แผนการรับน้ำมัน ลิตร', 'plan_received_liters'],
  ['รับจริง ยอดยกมา', 'available_liters'],
  ['รับจริง + ยอดยกมา', 'available_liters'],
  ['รับจริง_+_ยอดยกมา', 'available_liters'],
  ['รวมรับจริงยอดยกมา', 'available_liters'],
  ['ยอดรวมก่อนจ่าย', 'available_liters'],
  ['รวมยอดคงเหลือ', 'available_liters'],
  ['dispatched', 'dispatched_liters'],
  ['dispatched_liters', 'dispatched_liters'],
  ['dispatched liters', 'dispatched_liters'],
  ['จ่าย', 'dispatched_liters'],
  ['จ่ายรวม', 'dispatched_liters'],
  ['รวมจ่าย', 'dispatched_liters'],
  ['ยอดจ่าย', 'dispatched_liters'],
  ['จำนวนยอดจ่าย', 'dispatched_liters'],
  ['จำนวนยอดจ่าย ลิตร', 'dispatched_liters'],
  ['ใช้น้ำมัน', 'dispatched_liters'],
  ['การใช้น้ำมัน', 'dispatched_liters'],
  ['dispatched_namsaeng', 'dispatched_namsaeng'],
  ['นำแสง', 'dispatched_namsaeng'],
  ['จ่ายน้ำมันนำแสง', 'dispatched_namsaeng'],
  ['น้ำแสง', 'dispatched_namsaeng'],
  ['dispatched_kfp', 'dispatched_kfp'],
  ['กฟภ', 'dispatched_kfp'],
  ['จ่ายน้ำมันเครื่องกฟภ', 'dispatched_kfp'],
  ['closing', 'closing_liters'],
  ['closing_liters', 'closing_liters'],
  ['closing liters', 'closing_liters'],
  ['คงเหลือ', 'closing_liters'],
  ['คงเหลือในถังสำรอง', 'closing_liters'],
  ['คงเหลือ ลิตร', 'closing_liters'],
  ['employee_code', 'employee_code'],
  ['employeecode', 'employee_code'],
  ['employee code', 'employee_code'],
  ['reporter', 'employee_code'],
  ['รหัสพนักงาน', 'employee_code'],
  ['ผู้รายงาน', 'employee_code'],
  ['note', 'note'],
  ['remark', 'note'],
  ['remarks', 'note'],
  ['หมายเหตุ', 'note'],
  ['ทะเบียนรถ', 'note'],
  ['ไฟล์ต้นฉบับ', 'note'],
  ['ชื่อไฟล์ต้นฉบับ', 'note'],
];

function canonicalHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\u200B/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[._+:/\\|[\]{}"'`~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HEADER_ALIASES = HEADER_ALIAS_PAIRS.reduce<Record<string, string>>((acc, [header, field]) => {
  acc[canonicalHeader(header)] = field;
  acc[canonicalHeader(header).replace(/\s+/g, '')] = field;
  return acc;
}, {});

function normalizeHeader(header: string) {
  const canonical = canonicalHeader(header);
  return HEADER_ALIASES[canonical] ?? HEADER_ALIASES[canonical.replace(/\s+/g, '')] ?? canonical.replace(/\s+/g, '_');
}

function inferStationIdFromSheetName(sheetName?: string): StationId | null {
  const raw = sheetName?.toLowerCase() ?? '';
  if (!raw) return null;
  if (raw.includes('ลิปะน้อย') || raw.includes('lipanoi') || raw.includes('lipa')) return 'phangan';
  if (raw.includes('สฟฟ') || raw.includes('กม.1') || raw.includes('samui')) return 'samui';
  if (raw.includes('เกาะเต่า') || raw.includes('koh_tao') || raw.includes('tao') || raw.includes('บันทึกการใช้น้ำมันรายวัน')) return 'koh_tao';
  return null;
}

function isFuelRecordHeader(headers: string[]) {
  const headerSet = new Set(headers);
  const dailySignals = [
    'opening_liters',
    'received_liters',
    'available_liters',
    'dispatched_liters',
    'dispatched_namsaeng',
    'dispatched_kfp',
    'closing_liters',
  ];

  return headerSet.has('record_date') && dailySignals.filter((header) => headerSet.has(header)).length >= 2;
}

function parsePreviewNumber(value: string | undefined) {
  if (!value?.trim()) return 0;
  const normalized = value.replace(/[,\s]/g, '').replace(/[^\d().+-]/g, '');
  if (!normalized) return 0;
  const isNegative = /^\(.+\)$/.test(normalized);
  const parsed = Number(normalized.replace(/[()]/g, ''));
  if (!Number.isFinite(parsed)) return NaN;
  return isNegative ? -parsed : parsed;
}

function checkImportRows(rows: ParsedRow[], forcedStationId?: StationId) {
  const checks: ImportCheck[] = [];
  const seen = new Map<string, number>();
  const rowsByStation = new Map<string, Array<{ rowIndex: number; date: string; closing: number; opening: number }>>();

  rows.forEach((row, rowIndex) => {
    const stationId = forcedStationId || row.station_id;
    const recordDate = row.record_date?.trim();
    const rowNo = rowIndex + 2;

    if (!stationId) checks.push({ rowIndex, level: 'error', message: `แถว ${rowNo}: ไม่พบสถานที่` });
    if (!recordDate) checks.push({ rowIndex, level: 'error', message: `แถว ${rowNo}: ไม่พบวันที่` });

    if (stationId && recordDate) {
      const key = `${stationId}:${recordDate}`;
      const duplicateRow = seen.get(key);
      if (duplicateRow !== undefined) {
        checks.push({
          rowIndex,
          level: 'error',
          message: `แถว ${rowNo}: ซ้ำกับแถว ${duplicateRow + 2} ของสถานที่และวันที่เดียวกัน`,
        });
      } else {
        seen.set(key, rowIndex);
      }
    }

    const opening = parsePreviewNumber(row.opening_liters);
    const received = parsePreviewNumber(row.received_liters);
    const available = row.available_liters === undefined ? undefined : parsePreviewNumber(row.available_liters);
    const dispatched = parsePreviewNumber(row.dispatched_liters);
    const namsaeng = parsePreviewNumber(row.dispatched_namsaeng);
    const kfp = parsePreviewNumber(row.dispatched_kfp);
    const closing = parsePreviewNumber(row.closing_liters);
    const numericValues = [opening, received, dispatched, closing, namsaeng, kfp, available ?? 0];

    if (numericValues.some(Number.isNaN)) {
      checks.push({ rowIndex, level: 'error', message: `แถว ${rowNo}: มีตัวเลขที่อ่านไม่ได้` });
      return;
    }
    if (numericValues.some((value) => value < 0)) {
      checks.push({ rowIndex, level: 'error', message: `แถว ${rowNo}: มีค่าติดลบ` });
    }

    if (available !== undefined && Math.abs(available - (opening + received)) > CHECK_TOLERANCE_LITERS) {
      checks.push({
        rowIndex,
        level: 'warning',
        message: `แถว ${rowNo}: รับจริง+ยอดยกมาไม่ตรงกับยอดยกมา+รับจริง`,
      });
    }

    const totalDispatched = stationId === 'koh_tao' && (namsaeng || kfp) ? namsaeng + kfp : dispatched;
    if (stationId === 'koh_tao' && dispatched && Math.abs(dispatched - (namsaeng + kfp)) > CHECK_TOLERANCE_LITERS) {
      checks.push({
        rowIndex,
        level: 'warning',
        message: `แถว ${rowNo}: เกาะเต่า ยอดจ่ายรวมไม่ตรงกับนำแสง+กฟภ.`,
      });
    }

    if (row.closing_liters !== undefined) {
      const expectedClosing = opening + received - totalDispatched;
      if (Math.abs(closing - expectedClosing) > CHECK_TOLERANCE_LITERS) {
        checks.push({
          rowIndex,
          level: 'error',
          message: `แถว ${rowNo}: คงเหลือไม่ตรง ควรเป็น ${Math.round(expectedClosing).toLocaleString('th-TH')} ลิตร`,
        });
      }
    }

    if (stationId && recordDate) {
      const stationRows = rowsByStation.get(stationId) ?? [];
      stationRows.push({ rowIndex, date: recordDate, closing, opening });
      rowsByStation.set(stationId, stationRows);
    }
  });

  rowsByStation.forEach((stationRows) => {
    stationRows
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((record, index, sortedRows) => {
        const previous = sortedRows[index - 1];
        if (!previous) return;
        if (Math.abs(record.opening - previous.closing) > CHECK_TOLERANCE_LITERS) {
          checks.push({
            rowIndex: record.rowIndex,
            level: 'warning',
            message: `แถว ${record.rowIndex + 2}: ยอดยกมาไม่ตรงกับคงเหลือวันก่อนหน้า`,
          });
        }
      });
  });

  return checks;
}

function normalizeRows(rows: ParsedRow[]) {
  return rows.map((row) =>
    Object.entries(row).reduce<ParsedRow>((acc, [header, value]) => {
      const normalizedHeader = normalizeHeader(header);
      if (!acc[normalizedHeader] || value) {
        acc[normalizedHeader] = String(value ?? '').trim();
      }
      return acc;
    }, {})
  );
}

function buildRowsFromMatrix(matrix: string[][], sheetName?: string) {
  const candidates = matrix
    .map((row, index) => {
      const normalizedHeaders = row.map((cell) => normalizeHeader(String(cell ?? '')));
      const score = isFuelRecordHeader(normalizedHeaders)
        ? normalizedHeaders.filter((header) => REQUIRED_COLUMNS.concat(OPTIONAL_COLUMNS).includes(header)).length
        : 0;
      return { index, score, normalizedHeaders };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  const headerCandidate =
    candidates.find((candidate) => candidate.normalizedHeaders.includes('record_date')) ?? candidates[0];

  if (!headerCandidate) return [];

  const headers = headerCandidate.normalizedHeaders;
  const inferredStationId = inferStationIdFromSheetName(sheetName);
  return matrix
    .slice(headerCandidate.index + 1)
    .filter((dataRow) => dataRow.some((cell) => String(cell ?? '').trim()))
    .map((dataRow) =>
      headers.reduce<ParsedRow>((acc, header, index) => {
        if (!header) return acc;
        const value = String(dataRow[index] ?? '').trim();
        if (!acc[header] || value) acc[header] = value;
        return acc;
      }, { ...(sheetName ? { source_sheet_name: sheetName } : {}), ...(inferredStationId ? { station_id: inferredStationId } : {}) })
    )
    .filter((row) => row.record_date || Object.values(row).some(Boolean));
}

function detectDelimiter(line: string) {
  const commaCount = (line.match(/,/g) ?? []).length;
  const tabCount = (line.match(/\t/g) ?? []).length;
  return tabCount > commaCount ? '\t' : ',';
}

function parseDelimited(text: string): ParsedFile {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return { rows: [], sheets: [] };

  const delimiter = detectDelimiter(normalized.split('\n')[0] ?? '');
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const next = normalized[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(current.trim());
      current = '';
      continue;
    }
    if (char === '\n' && !quoted) {
      row.push(current.trim());
      rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  rows.push(row);

  return {
    rows: buildRowsFromMatrix(rows, 'CSV/TSV'),
    sheets: [{ name: 'CSV/TSV', rows: rows.length > 1 ? rows.length - 1 : 0, status: 'ready' as const }],
  };
}

async function parseSpreadsheet(file: File): Promise<ParsedFile> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), {
    cellDates: true,
    dense: false,
  });
  const parsedSheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return {
        name: sheetName,
        rows: [],
        summary: { name: sheetName, rows: 0, status: 'skipped' as const },
      };
    }
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    });
    const rows = normalizeRows(buildRowsFromMatrix(matrix, sheetName));
    return {
      name: sheetName,
      rows,
      summary: { name: sheetName, rows: rows.length, status: rows.length ? ('ready' as const) : ('skipped' as const) },
    };
  });

  return {
    rows: parsedSheets.flatMap((sheet) => sheet.rows),
    sheets: parsedSheets.map((sheet) => sheet.summary),
  };
}

async function parseFile(file: File): Promise<ParsedFile> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx')) {
    return parseSpreadsheet(file);
  }

  return parseDelimited(await file.text());
}

export function ImportRecordsPanel() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [sheetSummaries, setSheetSummaries] = useState<SheetSummary[]>([]);
  const [fileName, setFileName] = useState('');
  const [selectedStationId, setSelectedStationId] = useState<StationId>('samui');
  const [recordSource, setRecordSource] = useState<'database' | 'upload'>('database');
  const [forceSelectedStation, setForceSelectedStation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const missingColumns = useMemo(() => {
    if (!rows.length) return [];
    return REQUIRED_COLUMNS.filter((column) => !(column in rows[0]));
  }, [rows]);
  const rowChecks = useMemo(
    () => checkImportRows(rows, forceSelectedStation ? selectedStationId : undefined),
    [forceSelectedStation, rows, selectedStationId]
  );
  const errorCount = rowChecks.filter((check) => check.level === 'error').length;
  const warningCount = rowChecks.filter((check) => check.level === 'warning').length;
  const checkMap = useMemo(() => {
    const grouped = new Map<number, ImportCheck[]>();
    rowChecks.forEach((check) => {
      grouped.set(check.rowIndex, [...(grouped.get(check.rowIndex) ?? []), check]);
    });
    return grouped;
  }, [rowChecks]);

  const editableColumns = useMemo(() => {
    if (!rows.length) return EDITABLE_COLUMNS;
    const presentColumns = new Set(rows.flatMap((row) => Object.keys(row)));
    return EDITABLE_COLUMNS.filter((column) => presentColumns.has(column) || REQUIRED_COLUMNS.includes(column));
  }, [rows]);

  const updateRow = (rowIndex: number, column: string, value: string) => {
    setRows((currentRows) =>
      currentRows.map((row, index) => (index === rowIndex ? { ...row, [column]: value } : row))
    );
  };

  const removeRow = (rowIndex: number) => {
    setRows((currentRows) => currentRows.filter((_, index) => index !== rowIndex));
  };

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setMessage(null);
    setRows([]);
    setSheetSummaries([]);
    setFileName(file?.name ?? '');

    if (!file) return;

    const parsed = await parseFile(file);
    setRows(parsed.rows);
    setSheetSummaries(parsed.sheets);

    if (!parsed.rows.length) {
      setMessage('ไม่พบข้อมูลในไฟล์');
    }
  };

  const removeSheet = (sheetName: string) => {
    setRows((currentRows) => currentRows.filter((row) => row.source_sheet_name !== sheetName));
    setSheetSummaries((currentSheets) =>
      currentSheets.map((sheet) => (sheet.name === sheetName ? { ...sheet, rows: 0, status: 'skipped' } : sheet))
    );
  };

  const onImport = () => {
    const requiredMissing = missingColumns.filter((column) => column !== 'station_id');
    if (!rows.length || requiredMissing.length || errorCount > 0) return;

    startTransition(async () => {
      const rowsWithStation = rows.map((row) => ({
        ...row,
        station_id: forceSelectedStation || !row.station_id ? selectedStationId : row.station_id,
      }));
      const result = await importFuelRecords(rowsWithStation, fileName, recordSource);
      if (result.ok) {
        setMessage(`นำเข้า ${result.imported.toLocaleString('th-TH')} รายการเรียบร้อย`);
        setRows([]);
        setFileName('');
      } else {
        setMessage(result.error);
      }
    });
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-extrabold text-slate-950">นำเข้าข้อมูลย้อนหลัง</h2>
        <p className="text-sm text-slate-600">
          รองรับไฟล์ XLS, XLSX, CSV และ TSV จาก Excel โดยใช้คอลัมน์ {REQUIRED_COLUMNS.concat(OPTIONAL_COLUMNS).join(', ')}
        </p>
      </div>

      <div className="panel space-y-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_16rem_18rem_auto] lg:items-end">
          <div>
            <label className="field-label">ไฟล์ข้อมูลย้อนหลัง</label>
            <input
              type="file"
              accept=".xls,.xlsx,.csv,.tsv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values"
              onChange={onFileChange}
              className="field"
            />
          </div>
          <div>
            <label className="field-label">สถานที่ของข้อมูล</label>
            <select
              value={selectedStationId}
              onChange={(event) => setSelectedStationId(event.target.value as StationId)}
              className="field min-w-48"
            >
              {STATION_IDS.map((stationId) => (
                <option key={stationId} value={stationId}>
                  {STATION_LABEL[stationId]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">ประเภทการนำเข้า</label>
            <select
              value={recordSource}
              onChange={(event) => setRecordSource(event.target.value as 'database' | 'upload')}
              className="field"
            >
              <option value="database">ฐานข้อมูลย้อนหลัง</option>
              <option value="upload">อัปโหลดไฟล์ทั่วไป</option>
            </select>
          </div>
          <button
            type="button"
            onClick={onImport}
            disabled={!rows.length || missingColumns.filter((column) => column !== 'station_id').length > 0 || errorCount > 0 || isPending}
            className="btn-primary h-10 w-full lg:w-auto"
          >
            {isPending ? 'กำลังนำเข้า...' : 'นำเข้า record'}
          </button>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={forceSelectedStation}
            onChange={(event) => setForceSelectedStation(event.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          <span>ใช้สถานที่ที่เลือกกับทุก record ในไฟล์นี้</span>
        </label>

        <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="block text-xs font-bold text-slate-900">ไฟล์</span>
            {fileName || '-'}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="block text-xs font-bold text-slate-900">จำนวน record</span>
            {rows.length.toLocaleString('th-TH')}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="block text-xs font-bold text-slate-900">สถานะ</span>
            {missingColumns.filter((column) => column !== 'station_id').length
              ? `ขาดคอลัมน์ ${missingColumns.filter((column) => column !== 'station_id').join(', ')}`
              : rows.length
                ? errorCount > 0
                  ? `ต้องแก้ ${errorCount.toLocaleString('th-TH')} จุด`
                  : warningCount > 0
                    ? `มีคำเตือน ${warningCount.toLocaleString('th-TH')} จุด`
                    : missingColumns.includes('station_id') || forceSelectedStation
                      ? `พร้อมนำเข้าเป็น ${STATION_LABEL[selectedStationId]}`
                      : 'ผ่านการทวนสอบ พร้อมนำเข้า'
                : '-'}
          </div>
        </div>

        {rows.length > 0 && (
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              errorCount > 0
                ? 'border-red-200 bg-red-50 text-red-800'
                : warningCount > 0
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            <div className="font-extrabold">
              {errorCount > 0
                ? `ไม่ผ่านการทวนสอบ ${errorCount.toLocaleString('th-TH')} จุด`
                : warningCount > 0
                  ? `ผ่านแบบมีคำเตือน ${warningCount.toLocaleString('th-TH')} จุด`
                  : 'ผ่านการทวนสอบตัวเลข'}
            </div>
            {rowChecks.length > 0 && (
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                {rowChecks.slice(0, 8).map((check, index) => (
                  <li key={`${check.rowIndex}-${index}`}>{check.message}</li>
                ))}
                {rowChecks.length > 8 && <li>และอีก {(rowChecks.length - 8).toLocaleString('th-TH')} จุด</li>}
              </ul>
            )}
          </div>
        )}

        {sheetSummaries.length > 1 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-sm font-extrabold text-slate-900">แท็บในไฟล์</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sheetSummaries.map((sheet) => (
                <div key={sheet.name} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-bold text-slate-900">{sheet.name}</div>
                      <div className="text-xs text-slate-500">
                        {sheet.status === 'ready' ? `${sheet.rows.toLocaleString('th-TH')} record` : 'ข้ามแท็บนี้'}
                      </div>
                    </div>
                    {sheet.status === 'ready' && (
                      <button
                        type="button"
                        onClick={() => removeSheet(sheet.name)}
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
                      >
                        ไม่นำเข้า
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-semibold text-slate-800">ตรวจสอบและแก้ไขก่อนนำเข้า</span>
              {rows.length > 20 && <span>แสดง 20 แถวแรกจาก {rows.length.toLocaleString('th-TH')} record</span>}
            </div>
            <div className="table-shell">
            <table className="w-full min-w-[1320px] text-sm">
              <thead>
                <tr className="table-header">
                  <th className="px-3 py-2 text-left">แถว</th>
                  {editableColumns.map((header) => (
                      <th key={header} className="px-3 py-2 text-left">
                        {COLUMN_LABELS[header] ?? header}
                      </th>
                    ))}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((row, index) => {
                  const rowIssues = checkMap.get(index) ?? [];
                  const hasError = rowIssues.some((issue) => issue.level === 'error');
                  return (
                    <Fragment key={index}>
                      <tr
                        key={`row-${index}`}
                        className={`border-t border-slate-200 ${hasError ? 'bg-red-50' : rowIssues.length ? 'bg-amber-50' : ''}`}
                      >
                        <td className="px-3 py-2 font-bold text-slate-500">{index + 2}</td>
                        {editableColumns.map((header) => (
                          <td key={header} className="px-2 py-2 align-top">
                            <input
                              value={row[header] ?? ''}
                              onChange={(event) => updateRow(index, header, event.target.value)}
                              className="h-8 w-full min-w-28 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => removeRow(index)}
                            className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
                          >
                            ลบแถว
                          </button>
                        </td>
                      </tr>
                      {rowIssues.length > 0 && (
                        <tr key={`issues-${index}`} className={hasError ? 'bg-red-50' : 'bg-amber-50'}>
                          <td colSpan={editableColumns.length + 2} className="px-3 py-2 text-xs font-semibold">
                            <div className={hasError ? 'text-red-700' : 'text-amber-700'}>
                              {rowIssues.map((issue) => issue.message).join(' | ')}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {message && <pre className="whitespace-pre-wrap rounded-lg bg-slate-950 px-3 py-2 text-xs text-white">{message}</pre>}
      </div>
    </section>
  );
}
