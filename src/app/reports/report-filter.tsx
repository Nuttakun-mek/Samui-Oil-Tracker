'use client';

import { Download, Search } from 'lucide-react';
import { useState } from 'react';
import { STATION_LABEL, type Station } from '@/lib/types/domain';
import { DatePicker } from '@/components/ui/date-picker';
import { MonthPicker } from '@/components/ui/month-picker';

function wholeMonthForRange(from: string, to: string) {
  if (from.slice(0, 7) !== to.slice(0, 7) || !from.endsWith('-01')) return '';
  const [year, month] = from.slice(0, 7).split('-').map(Number);
  const lastDay = String(new Date(year, month, 0).getDate()).padStart(2, '0');
  return to === `${from.slice(0, 7)}-${lastDay}` ? from.slice(0, 7) : '';
}

export function ReportFilter({
  initialFrom,
  initialTo,
  initialStation,
  stations,
}: {
  initialFrom: string;
  initialTo: string;
  initialStation: string;
  stations: Station[];
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [month, setMonth] = useState(wholeMonthForRange(initialFrom, initialTo));
  const [station, setStation] = useState(initialStation);
  const [forceDailyChart, setForceDailyChart] = useState(false);
  const validRange = Boolean(from && to && from <= to);
  const query = new URLSearchParams({ from, to, station }).toString();
  const pdfQuery = new URLSearchParams({ from, to, station, ...(forceDailyChart ? { chartMode: 'daily' } : {}) }).toString();
  const dayMs = 24 * 60 * 60 * 1000;
  const spanDays = validRange ? Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / dayMs) + 1 : 0;

  const selectMonth = (value: string) => {
    setMonth(value);
    if (!value) return;
    const [year, monthNumber] = value.split('-').map(Number);
    setFrom(`${value}-01`);
    setTo(`${value}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, '0')}`);
  };

  const selectDate = (side: 'from' | 'to', value: string) => {
    setMonth('');
    if (side === 'from') setFrom(value);
    else setTo(value);
  };

  return (
    <div className="border-y border-slate-200 py-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1fr_1fr_auto_auto] xl:items-end">
        <div>
          <label className="field-label" htmlFor="report-month">เลือกเดือน</label>
          <MonthPicker id="report-month" value={month} defaultViewMonth={from.slice(0, 7) || to.slice(0, 7)} onChange={selectMonth} />
        </div>
        <div>
          <label className="field-label" htmlFor="report-station">พื้นที่</label>
          <select id="report-station" value={station} onChange={(event) => setStation(event.target.value)} className="field">
            <option value="all">ทุกพื้นที่</option>
            {stations.map((item) => <option key={item.id} value={item.id}>{STATION_LABEL[item.id]}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="report-from">ตั้งแต่วันที่</label>
          <DatePicker id="report-from" value={from} max={to || undefined} defaultViewMonth={month || to.slice(0, 7)} onChange={(value) => selectDate('from', value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="report-to">ถึงวันที่</label>
          <DatePicker id="report-to" value={to} min={from || undefined} defaultViewMonth={month || from.slice(0, 7)} onChange={(value) => selectDate('to', value)} />
        </div>
        <a href={validRange ? `/reports?${query}` : '#'} aria-disabled={!validRange} className={`btn-secondary justify-center ${!validRange ? 'pointer-events-none opacity-50' : ''}`}>
          <Search size={17} aria-hidden="true" />
          แสดงข้อมูล
        </a>
        <a href={validRange ? `/api/reports/daily-pdf?${pdfQuery}` : '#'} aria-disabled={!validRange} className={`btn-primary justify-center ${!validRange ? 'pointer-events-none opacity-50' : ''}`}>
          <Download size={17} aria-hidden="true" />
          ดาวน์โหลด PDF
        </a>
      </div>
      {spanDays > 45 && (
        <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={forceDailyChart} onChange={(event) => setForceDailyChart(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          บังคับกราฟรายวันใน PDF (ปกติช่วงเกิน 45 วันจะสรุปเป็นรายเดือนแทน — ทำให้กราฟแน่นขึ้นแต่เห็นทุกวัน)
        </label>
      )}
    </div>
  );
}
