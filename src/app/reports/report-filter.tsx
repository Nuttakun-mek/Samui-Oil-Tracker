'use client';

import { Download, Search } from 'lucide-react';
import { useState } from 'react';
import { STATION_LABEL, type Station, type StationId } from '@/lib/types/domain';
import { DatePicker } from '@/components/ui/date-picker';
import { MonthPicker } from '@/components/ui/month-picker';

function wholeMonthForRange(from: string, to: string) {
  if (from.slice(0, 7) !== to.slice(0, 7) || !from.endsWith('-01')) return '';
  const [year, month] = from.slice(0, 7).split('-').map(Number);
  const lastDay = String(new Date(year, month, 0).getDate()).padStart(2, '0');
  return to === `${from.slice(0, 7)}-${lastDay}` ? from.slice(0, 7) : '';
}

// พื้นที่ที่เลือก: 'all' (ทุกพื้นที่) หรือรายการ id คั่นด้วยจุลภาค เช่น 'samui,koh_tao' — เลือกได้ตั้งแต่ 1 ถึงทุกพื้นที่
function parseInitialStations(initialStation: string, stations: Station[]) {
  if (!initialStation || initialStation === 'all') return new Set(stations.map((item) => item.id));
  const requested = new Set(initialStation.split(','));
  const matched = stations.filter((item) => requested.has(item.id)).map((item) => item.id);
  return new Set(matched.length ? matched : stations.map((item) => item.id));
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
  const [selectedStations, setSelectedStations] = useState(() => parseInitialStations(initialStation, stations));
  const [forceDailyChart, setForceDailyChart] = useState(false);
  const validRange = Boolean(from && to && from <= to && selectedStations.size > 0);
  const stationParam = selectedStations.size === stations.length ? 'all' : [...selectedStations].join(',');
  const query = new URLSearchParams({ from, to, station: stationParam }).toString();
  const pdfQuery = new URLSearchParams({ from, to, station: stationParam, ...(forceDailyChart ? { chartMode: 'daily' } : {}) }).toString();
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

  const toggleStation = (id: StationId) => {
    setSelectedStations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="border-y border-slate-200 py-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1fr_1fr_auto_auto] xl:items-end">
        <div>
          <label className="field-label" htmlFor="report-month">เลือกเดือน</label>
          <MonthPicker id="report-month" value={month} defaultViewMonth={from.slice(0, 7) || to.slice(0, 7)} onChange={selectMonth} />
        </div>
        <div>
          <span className="field-label">พื้นที่ (เลือกได้มากกว่า 1)</span>
          <div className="flex min-h-[42px] flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-2">
            {stations.map((item) => (
              <label key={item.id} className="flex items-center gap-1.5 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={selectedStations.has(item.id)}
                  onChange={() => toggleStation(item.id)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {STATION_LABEL[item.id]}
              </label>
            ))}
          </div>
          {selectedStations.size === 0 && <p className="mt-1 text-xs font-semibold text-red-600">เลือกอย่างน้อย 1 พื้นที่</p>}
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
