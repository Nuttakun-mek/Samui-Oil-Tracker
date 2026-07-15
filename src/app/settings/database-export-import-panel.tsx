'use client';

import { useMemo, useState, useTransition } from 'react';
import { importDatabaseExportRows } from './actions';

type ExportKind =
  | 'sites'
  | 'daily_fuel_balance'
  | 'monthly_summary'
  | 'delivery_plan_log'
  | 'fuel_contracts'
  | 'file_manifest';

type ParsedCsvFile = {
  fileName: string;
  kind: ExportKind | null;
  rows: Record<string, string>[];
  status: 'ready' | 'unsupported' | 'imported' | 'error';
  message?: string;
};

const IMPORT_ORDER: ExportKind[] = [
  'sites',
  'fuel_contracts',
  'daily_fuel_balance',
  'delivery_plan_log',
  'monthly_summary',
  'file_manifest',
];

const KIND_LABEL: Record<ExportKind, string> = {
  sites: 'แผนผังสถานที่',
  fuel_contracts: 'สัญญา/PO น้ำมัน',
  daily_fuel_balance: 'บันทึกน้ำมันรายวัน',
  delivery_plan_log: 'แผนจัดส่งน้ำมัน',
  monthly_summary: 'สรุปรายเดือน',
  file_manifest: 'ทะเบียนไฟล์ต้นฉบับ',
};

const REQUIRED_HEADERS: Record<ExportKind, string[]> = {
  sites: ['site_id', 'site_code', 'site_name_th'],
  fuel_contracts: ['contract_code', 'quantity_liters'],
  daily_fuel_balance: ['site_id', 'record_date', 'opening_balance_liters', 'received_liters', 'dispensed_total_liters', 'closing_balance_liters'],
  delivery_plan_log: ['site_id', 'batch_no', 'source_file', 'snapshot_date'],
  monthly_summary: ['site_id', 'year_be', 'month_num', 'received_liters', 'dispensed_liters'],
  file_manifest: ['file_name', 'status'],
};

function inferKind(fileName: string): ExportKind | null {
  const lowerName = fileName.toLowerCase();
  if (lowerName === 'sites.csv') return 'sites';
  if (lowerName === 'fuel_contracts.csv') return 'fuel_contracts';
  if (lowerName === 'daily_fuel_balance.csv') return 'daily_fuel_balance';
  if (lowerName === 'delivery_plan_log.csv') return 'delivery_plan_log';
  if (lowerName === 'monthly_summary.csv') return 'monthly_summary';
  if (lowerName === 'file_manifest.csv') return 'file_manifest';
  return null;
}

function parseCsv(text: string) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  const matrix: string[][] = [];
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
    if (char === ',' && !quoted) {
      row.push(current.trim());
      current = '';
      continue;
    }
    if (char === '\n' && !quoted) {
      row.push(current.trim());
      matrix.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  matrix.push(row);

  const headers = matrix[0]?.map((header) => header.trim()) ?? [];
  return matrix.slice(1).map((cells) =>
    headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = cells[index]?.trim() ?? '';
      return acc;
    }, {})
  );
}

function getHeaderIssues(file: ParsedCsvFile) {
  if (!file.kind) return ['ชื่อไฟล์ไม่ตรงกับชุด database export'];
  const headers = new Set(Object.keys(file.rows[0] ?? {}));
  return REQUIRED_HEADERS[file.kind].filter((header) => !headers.has(header)).map((header) => `ขาดคอลัมน์ ${header}`);
}

export function DatabaseExportImportPanel() {
  const [files, setFiles] = useState<ParsedCsvFile[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const totals = useMemo(() => {
    const ready = files.filter((file) => file.status === 'ready' && !getHeaderIssues(file).length);
    return {
      files: files.length,
      ready: ready.length,
      rows: ready.reduce((sum, file) => sum + file.rows.length, 0),
    };
  }, [files]);

  const onFilesChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    setMessage(null);

    const parsed = await Promise.all(
      selectedFiles.map(async (file) => {
        const kind = inferKind(file.name);
        const rows = file.name.toLowerCase().endsWith('.csv') ? parseCsv(await file.text()) : [];
        const message = !kind
          ? 'รองรับเฉพาะไฟล์ CSV ตามชื่อใน spec'
          : rows.length
            ? undefined
            : 'ไฟล์ว่างหรือไม่มีข้อมูลหลัง header';

        return {
          fileName: file.name,
          kind,
          rows,
          status: kind && rows.length ? ('ready' as const) : ('unsupported' as const),
          message,
        };
      })
    );

    const kindCounts = parsed.reduce<Map<ExportKind, number>>((acc, file) => {
      if (!file.kind) return acc;
      acc.set(file.kind, (acc.get(file.kind) ?? 0) + 1);
      return acc;
    }, new Map());

    setFiles(
      parsed.map((file) =>
        file.kind && (kindCounts.get(file.kind) ?? 0) > 1
          ? { ...file, status: 'error' as const, message: `เลือกไฟล์ประเภท ${KIND_LABEL[file.kind]} ซ้ำ` }
          : file
      )
    );
  };

  const importFiles = () => {
    const filesByKind = new Map(files.filter((file) => file.kind).map((file) => [file.kind, file]));
    const importableFiles = IMPORT_ORDER.map((kind) => filesByKind.get(kind)).filter(
      (file): file is ParsedCsvFile => !!file && file.status === 'ready' && !getHeaderIssues(file).length
    );

    if (!importableFiles.length) return;

    startTransition(async () => {
      const nextFiles = [...files];
      const logs: string[] = [];

      for (const file of importableFiles) {
        const result = await importDatabaseExportRows(file.kind!, file.rows, file.fileName);
        const index = nextFiles.findIndex((candidate) => candidate.fileName === file.fileName);

        if (result.ok) {
          logs.push(`${file.fileName}: นำเข้า ${result.imported.toLocaleString('th-TH')} รายการ`);
          if (index >= 0) nextFiles[index] = { ...nextFiles[index], status: 'imported', message: 'นำเข้าสำเร็จ' };
        } else {
          logs.push(`${file.fileName}: ${result.error}`);
          if (index >= 0) nextFiles[index] = { ...nextFiles[index], status: 'error', message: result.error };
          break;
        }
      }

      setFiles(nextFiles);
      setMessage(logs.join('\n'));
    });
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-extrabold text-slate-950">นำเข้าชุดฐานข้อมูลตาม spec</h2>
        <p className="text-sm text-slate-600">
          รองรับไฟล์ sites, fuel_contracts, daily_fuel_balance, delivery_plan_log, monthly_summary และ file_manifest จาก database_design_spec.md
        </p>
      </div>

      <div className="panel space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <label className="field-label">เลือกไฟล์ CSV จากชุด database export</label>
            <input type="file" multiple accept=".csv,text/csv" onChange={onFilesChange} className="field" />
          </div>
          <button
            type="button"
            onClick={importFiles}
            disabled={!totals.ready || isPending}
            className="btn-primary h-10 w-full lg:w-auto"
          >
            {isPending ? 'กำลังนำเข้าชุดไฟล์...' : 'นำเข้าชุดไฟล์'}
          </button>
        </div>

        <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="block text-xs font-bold text-slate-900">จำนวนไฟล์</span>
            {totals.files.toLocaleString('th-TH')}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="block text-xs font-bold text-slate-900">พร้อมนำเข้า</span>
            {totals.ready.toLocaleString('th-TH')}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="block text-xs font-bold text-slate-900">จำนวน record</span>
            {totals.rows.toLocaleString('th-TH')}
          </div>
        </div>

        {files.length > 0 && (
          <div className="table-shell">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="table-header">
                  <th className="px-3 py-2 text-left">ไฟล์</th>
                  <th className="px-3 py-2 text-left">ประเภทข้อมูล</th>
                  <th className="px-3 py-2 text-right">Record</th>
                  <th className="px-3 py-2 text-left">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file, index) => {
                  const issues = getHeaderIssues(file);
                  const statusText =
                    file.status === 'imported'
                      ? 'นำเข้าแล้ว'
                      : file.status === 'error'
                        ? file.message ?? 'นำเข้าไม่สำเร็จ'
                        : issues.length
                          ? issues.join(' / ')
                          : file.status === 'ready'
                            ? 'พร้อมนำเข้า'
                            : file.message ?? 'ไม่รองรับ';

                  return (
                    <tr key={`${file.fileName}-${index}`} className="border-t border-slate-200">
                      <td className="px-3 py-2 font-semibold text-slate-900">{file.fileName}</td>
                      <td className="px-3 py-2">{file.kind ? KIND_LABEL[file.kind] : '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{file.rows.length.toLocaleString('th-TH')}</td>
                      <td className="px-3 py-2 text-slate-600">{statusText}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {message && <pre className="whitespace-pre-wrap rounded-lg bg-slate-950 px-3 py-2 text-xs text-white">{message}</pre>}
      </div>
    </section>
  );
}
