'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, MapPin, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { STATION_LABEL, type FuelRecord, type Station, type StationId } from '@/lib/types/domain';
import { formatThaiDate, formatThaiDateShort, formatThaiMonth } from '@/lib/format/thai-date';
import { estimatedFuelCost } from '@/lib/analytics/fuel';
import { buildTrendBuckets, computeStationInsight } from '@/lib/analytics/station-insight';

type PeriodMode = 'daily' | 'monthly';
type RangeMode = 'all' | '30' | '90' | '180';
type StationFilter = 'all' | StationId;

const STATION_SHORT: Record<StationId, { title: string; detail: string; buttonAccent: string; cardAccent: string }> = {
  samui: { title: 'เกาะสมุย', detail: 'สถานีไฟฟ้าสมุย 1 · บ้านพังกา', buttonAccent: 'border-l-brand-600', cardAccent: 'border-t-brand-600' },
  phangan: { title: 'เกาะพะงัน', detail: 'เครื่องกำเนิดไฟฟ้า · ลิปะน้อย', buttonAccent: 'border-l-gold-500', cardAccent: 'border-t-gold-500' },
  koh_tao: { title: 'เกาะเต่า', detail: 'โรงจักรเกาะเต่า', buttonAccent: 'border-l-slate-500', cardAccent: 'border-t-slate-500' },
};

const RANGE_OPTIONS: { value: RangeMode; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: '30', label: '30 วัน' },
  { value: '90', label: '90 วัน' },
  { value: '180', label: '180 วัน' },
];

function rangeStart(latestDate: string | null, range: RangeMode) {
  if (!latestDate || range === 'all') return null;
  const days = Number(range);
  return new Date(new Date(`${latestDate}T00:00:00`).getTime() - (days - 1) * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString('th-TH');
}

export function DashboardAnalytics({ stations, records }: { stations: Station[]; records: FuelRecord[] }) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('monthly');
  const [stationFilter, setStationFilter] = useState<StationFilter>('all');
  const [rangeMode, setRangeMode] = useState<RangeMode>('all');
  const [monthFilter, setMonthFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const latestDate = records.at(-1)?.record_date ?? null;
  const startDate = rangeStart(latestDate, rangeMode);

  const filteredRecords = useMemo(() => records.filter((record) => {
    if (stationFilter !== 'all' && record.station_id !== stationFilter) return false;
    if (monthFilter && !record.record_date.startsWith(monthFilter)) return false;
    if (fromDate && record.record_date < fromDate) return false;
    if (toDate && record.record_date > toDate) return false;
    if (startDate && record.record_date < startDate) return false;
    return true;
  }), [fromDate, monthFilter, records, startDate, stationFilter, toDate]);

  const chartData = useMemo(
    () => buildTrendBuckets(filteredRecords, periodMode).map((bucket) => ({
      period: bucket.periodLabel,
      received: bucket.received,
      dispatched: bucket.dispatched,
      closing: bucket.closing,
    })),
    [filteredRecords, periodMode]
  );

  const totals = useMemo(() => {
    const latestByStation = new Map<StationId, FuelRecord>();
    let received = 0;
    let dispatched = 0;
    filteredRecords.forEach((record) => {
      received += record.received_liters;
      dispatched += record.dispatched_liters;
      latestByStation.set(record.station_id, record);
    });
    return {
      received,
      dispatched,
      latestClosing: Array.from(latestByStation.values()).reduce((sum, record) => sum + record.closing_liters, 0),
    };
  }, [filteredRecords]);

  const stationInsights = useMemo(() => stations
    .filter((station) => stationFilter === 'all' || station.id === stationFilter)
    .map((station) => computeStationInsight(station, filteredRecords, totals.dispatched)),
    [filteredRecords, stationFilter, stations, totals.dispatched]);

  const netChange = totals.received - totals.dispatched;
  const usageRatio = totals.received > 0 ? (totals.dispatched / totals.received) * 100 : 0;
  const budget = estimatedFuelCost(stations, filteredRecords);
  const selectedStationLabel = stationFilter === 'all' ? 'ทุกพื้นที่' : STATION_SHORT[stationFilter].title;
  const periodLabel = monthFilter
    ? formatThaiMonth(monthFilter)
    : fromDate || toDate
      ? `${fromDate ? formatThaiDateShort(fromDate) : 'วันแรก'} ถึง ${toDate ? formatThaiDateShort(toDate) : 'วันล่าสุด'}`
      : rangeMode === 'all'
        ? 'ข้อมูลทั้งหมด'
        : `${rangeMode} วันล่าสุด`;
  const hasCustomFilters = stationFilter !== 'all'
    || rangeMode !== 'all'
    || Boolean(monthFilter || fromDate || toDate)
    || periodMode !== 'monthly';

  const selectQuickRange = (value: RangeMode) => {
    setRangeMode(value);
    setMonthFilter('');
    setFromDate('');
    setToDate('');
  };

  const selectMonth = (value: string) => {
    setMonthFilter(value);
    setRangeMode('all');
    setFromDate('');
    setToDate('');
  };

  const selectDate = (side: 'from' | 'to', value: string) => {
    setRangeMode('all');
    setMonthFilter('');
    if (side === 'from') setFromDate(value);
    else setToDate(value);
  };

  const resetFilters = () => {
    setStationFilter('all');
    setRangeMode('all');
    setMonthFilter('');
    setFromDate('');
    setToDate('');
    setPeriodMode('monthly');
  };

  const highestUsage = stationInsights.filter((item) => item.records.length > 0).sort((a, b) => b.dispatched - a.dispatched)[0];
  const lowestCoverage = stationInsights
    .filter((item) => item.daysRemaining !== null)
    .sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity))[0];
  const highestBudget = stationInsights.filter((item) => item.records.length > 0).sort((a, b) => b.budget - a.budget)[0];

  return (
    <section className="panel overflow-hidden !p-0">
      <div className="px-4 py-5 sm:px-5">
        <h2 className="panel-title">วิเคราะห์รับเข้า-ใช้ออก-คงเหลือ</h2>
        <p className="text-sm leading-6 text-slate-500">เลือกพื้นที่และช่วงเวลาก่อน ระบบจะปรับกราฟ KPI และ Insight รายพื้นที่ให้ตรงกันทั้งหมด</p>
      </div>

      <div className="border-y border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
        <fieldset>
          <legend className="mb-2 text-xs font-extrabold text-slate-700">1. เลือกพื้นที่ข้อมูล</legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              aria-pressed={stationFilter === 'all'}
              onClick={() => setStationFilter('all')}
              className={`min-h-14 rounded-md border-l-4 px-3 py-2 text-left transition ${stationFilter === 'all' ? 'border-brand-600 bg-brand-600 text-white shadow-sm' : 'border-brand-300 bg-white text-slate-800 hover:bg-brand-50'}`}
            >
              <span className="block text-sm font-extrabold">ทุกพื้นที่</span>
              <span className={`block text-xs ${stationFilter === 'all' ? 'text-white/70' : 'text-slate-500'}`}>รวมเกาะสมุย พะงัน และเต่า</span>
            </button>
            {stations.map((station) => {
              const selected = stationFilter === station.id;
              const label = STATION_SHORT[station.id];
              return (
                <button
                  key={station.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setStationFilter(station.id)}
                  className={`min-h-14 rounded-md border border-l-4 px-3 py-2 text-left transition ${selected ? `${label.buttonAccent} border-y-brand-600 border-r-brand-600 bg-brand-600 text-white shadow-sm` : `${label.buttonAccent} border-y-slate-200 border-r-slate-200 bg-white text-slate-800 hover:bg-brand-50`}`}
                >
                  <span className="block text-sm font-extrabold">{label.title}</span>
                  <span className={`block text-xs ${selected ? 'text-white/70' : 'text-slate-500'}`}>{label.detail}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-end">
          <fieldset>
            <legend className="mb-2 text-xs font-extrabold text-slate-700">2. ช่วงด่วน</legend>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={rangeMode === option.value && !monthFilter && !fromDate && !toDate}
                  onClick={() => selectQuickRange(option.value)}
                  className={`min-h-10 border-r border-slate-200 px-3 text-xs font-bold last:border-0 ${rangeMode === option.value && !monthFilter && !fromDate && !toDate ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 hover:bg-brand-50'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-slate-700">
              <CalendarDays size={14} aria-hidden="true" />
              หรือระบุเดือน/ช่วงวันที่
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <label className="sr-only" htmlFor="dashboard-month">เลือกเดือน</label>
                <input id="dashboard-month" aria-label="เลือกเดือน" type="month" value={monthFilter} onChange={(event) => selectMonth(event.target.value)} className="field h-10" />
              </div>
              <div>
                <label className="sr-only" htmlFor="dashboard-from">ตั้งแต่วันที่</label>
                <input id="dashboard-from" aria-label="ตั้งแต่วันที่" type="date" value={fromDate} max={toDate || undefined} onChange={(event) => selectDate('from', event.target.value)} className="field h-10" />
              </div>
              <div>
                <label className="sr-only" htmlFor="dashboard-to">ถึงวันที่</label>
                <input id="dashboard-to" aria-label="ถึงวันที่" type="date" value={toDate} min={fromDate || undefined} onChange={(event) => selectDate('to', event.target.value)} className="field h-10" />
              </div>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div>
              <span className="mb-2 block text-xs font-extrabold text-slate-700">3. รูปแบบกราฟ</span>
              <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
                {(['monthly', 'daily'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={periodMode === mode}
                    onClick={() => setPeriodMode(mode)}
                    className={`min-h-10 px-3 text-xs font-bold ${periodMode === mode ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 hover:bg-brand-50'}`}
                  >
                    {mode === 'monthly' ? 'รายเดือน' : 'รายวัน'}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={resetFilters} disabled={!hasCustomFilters} className="btn-secondary h-10 !min-h-10 !px-3" title="ล้างตัวกรอง">
              <RotateCcw size={16} aria-hidden="true" />
              <span className="hidden sm:inline">ล้างค่า</span>
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          <span><strong className="text-brand-700">พื้นที่:</strong> {selectedStationLabel}</span>
          <span><strong className="text-brand-700">ช่วง:</strong> {periodLabel}</span>
          <span><strong className="text-brand-700">ข้อมูล:</strong> {filteredRecords.length.toLocaleString('th-TH')} รายการ</span>
        </div>
      </div>

      <div className="space-y-5 px-4 py-5 sm:px-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5">
            <div className="text-xs font-bold text-brand-700">รับเข้ารวม · {selectedStationLabel}</div>
            <div className="text-xl font-extrabold text-brand-900 tabular-nums">{formatNumber(totals.received)}</div>
          </div>
          <div className="rounded-lg border border-gold-200 bg-gold-50 px-3 py-2.5">
            <div className="text-xs font-bold text-gold-700">ใช้ออกรวม · {selectedStationLabel}</div>
            <div className="text-xl font-extrabold text-gold-700 tabular-nums">{formatNumber(totals.dispatched)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <div className="text-xs font-bold text-slate-600">คงเหลือล่าสุด</div>
            <div className="text-xl font-extrabold text-slate-950 tabular-nums">{formatNumber(totals.latestClosing)}</div>
          </div>
          <div className={`rounded-lg border px-3 py-2.5 ${netChange >= 0 ? 'border-brand-200 bg-brand-50' : 'border-red-200 bg-red-50'}`}>
            <div className={`text-xs font-bold ${netChange >= 0 ? 'text-brand-700' : 'text-red-700'}`}>สมดุลรับ-ใช้</div>
            <div className={`text-xl font-extrabold tabular-nums ${netChange >= 0 ? 'text-brand-900' : 'text-red-900'}`}>{formatNumber(netChange)}</div>
          </div>
          <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5">
            <div className="text-xs font-bold text-brand-700">งบประมาณโดยประมาณ</div>
            <div className="text-xl font-extrabold tabular-nums text-brand-900">{budget.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="text-xs font-semibold text-brand-700">บาท</div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-base font-extrabold text-slate-950">แนวโน้ม {selectedStationLabel}</h3>
              <p className="text-xs text-slate-500">ฟ้า: รับเข้า · เขียว: ใช้ออก · เส้นเหลืองทอง: คงเหลือปลายช่วง (หน่วย: ลิตร)</p>
            </div>
            <span className="text-xs font-semibold text-slate-500">{periodLabel}</span>
          </div>
          {chartData.length ? (
            <div className="h-[380px] w-full">
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#64748B' }} minTickGap={periodMode === 'daily' ? 28 : 12} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    tickFormatter={(value) => Number(value).toLocaleString('th-TH')}
                    width={72}
                    label={{ value: 'ลิตร', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#64748B', textAnchor: 'middle' } }}
                  />
                  <Tooltip formatter={(value: number, name) => [`${Number(value).toLocaleString('th-TH')} ลิตร`, name]} labelFormatter={(label) => `ช่วง ${label}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="received" name="รับเข้า (ลิตร)" fill="#2a78d6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="dispatched" name="ใช้ออก (ลิตร)" fill="#1baf7a" radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="closing" name="คงเหลือ (ลิตร)" stroke="#eda100" strokeWidth={3} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-52 items-center justify-center border-y border-slate-200 text-sm text-slate-500">ไม่พบข้อมูลในตัวกรองที่เลือก</div>
          )}
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          อัตราใช้ออกเทียบรับเข้า <strong>{usageRatio.toFixed(1)}%</strong> จากข้อมูล {filteredRecords.length.toLocaleString('th-TH')} รายการ
        </div>

        <section>
          <div className="mb-3">
            <h3 className="text-base font-extrabold text-slate-950">Insight แยกตามพื้นที่</h3>
            <p className="text-sm text-slate-500">เปรียบเทียบจากข้อมูลที่ผ่านตัวกรองเดียวกับกราฟ</p>
          </div>

          {stationFilter === 'all' && stationInsights.some((item) => item.records.length > 0) && (
            <div className="mb-3 grid gap-2 md:grid-cols-3">
              <div className="rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
                <span className="text-xs font-bold text-brand-700">ใช้น้ำมันสูงสุด</span>
                <p className="font-extrabold text-brand-900">{highestUsage ? `${STATION_SHORT[highestUsage.station.id].title} · ${formatNumber(highestUsage.dispatched)} ลิตร` : '-'}</p>
              </div>
              <div className="rounded-md border border-gold-200 bg-gold-50 px-3 py-2 text-sm">
                <span className="text-xs font-bold text-gold-700">คงเหลือใช้ได้น้อยสุด</span>
                <p className="font-extrabold text-gold-700">{lowestCoverage ? `${STATION_SHORT[lowestCoverage.station.id].title} · ${lowestCoverage.daysRemaining?.toFixed(1)} วัน` : '-'}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="text-xs font-bold text-slate-600">งบประมาณสูงสุด</span>
                <p className="font-extrabold text-slate-950">{highestBudget ? `${STATION_SHORT[highestBudget.station.id].title} · ${highestBudget.budget.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท` : '-'}</p>
              </div>
            </div>
          )}

          <div className={`grid gap-3 ${stationInsights.length > 1 ? 'xl:grid-cols-3' : ''}`}>
            {stationInsights.map((item) => {
              const label = STATION_SHORT[item.station.id];
              const statusLabel = item.status === 'danger' ? 'วิกฤต' : item.status === 'warn' ? 'เฝ้าระวัง' : 'ปกติ';
              const statusClass = item.status === 'danger' ? 'bg-red-50 text-red-700' : item.status === 'warn' ? 'bg-gold-50 text-gold-700' : 'bg-brand-50 text-brand-700';
              return (
                <article key={item.station.id} className={`rounded-lg border border-slate-200 border-t-4 ${label.cardAccent} bg-white p-4 shadow-sm`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <MapPin size={18} className="mt-0.5 shrink-0 text-brand-700" aria-hidden="true" />
                      <div>
                        <h4 className="font-extrabold text-slate-950">{label.title}</h4>
                        <p className="text-xs leading-5 text-slate-500">{STATION_LABEL[item.station.id]}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-bold ${statusClass}`}>{statusLabel}</span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4">
                    <div>
                      <dt className="text-xs text-slate-500">คงเหลือล่าสุด</dt>
                      <dd className="font-extrabold tabular-nums text-slate-950">{formatNumber(item.closing)} ลิตร</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">คาดว่าใช้ได้อีก</dt>
                      <dd className={`font-extrabold tabular-nums ${item.status === 'danger' ? 'text-red-700' : 'text-slate-950'}`}>{item.daysRemaining === null ? '-' : `${item.daysRemaining.toFixed(1)} วัน`}</dd>
                      {item.etaDate && <dd className="text-xs font-semibold text-slate-500">คาดหมดวันที่ {formatThaiDate(item.etaDate)}</dd>}
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">รับเข้า / ใช้ออก</dt>
                      <dd className="font-bold tabular-nums text-slate-800">{formatNumber(item.received)} / {formatNumber(item.dispatched)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">ใช้เฉลี่ย 7 รายการล่าสุด</dt>
                      <dd className="font-bold tabular-nums text-slate-800">{formatNumber(item.averageDaily)} ลิตร/วัน</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">สัดส่วนการใช้</dt>
                      <dd className="font-bold tabular-nums text-slate-800">{item.share.toFixed(1)}% ของที่เลือก</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">แนวโน้ม 7 รายการ</dt>
                      <dd className={`flex items-center gap-1 font-bold tabular-nums ${item.trendPct !== null && item.trendPct > 0 ? 'text-red-700' : 'text-brand-700'}`}>
                        {item.trendPct === null ? '-' : <>{item.trendPct > 0 ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />}{Math.abs(item.trendPct).toFixed(1)}%</>}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">วันที่ใช้สูงสุด</dt>
                      <dd className="font-bold tabular-nums text-slate-800">{item.peak ? `${formatThaiDateShort(item.peak.record_date)} · ${formatNumber(item.peak.dispatched_liters)}` : '-'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">งบประมาณ</dt>
                      <dd className="font-bold tabular-nums text-slate-800">{item.budget.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท</dd>
                    </div>
                  </dl>
                  <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">{item.records.length.toLocaleString('th-TH')} รายการ · {item.activeDays.toLocaleString('th-TH')} วันที่มีข้อมูล</p>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
