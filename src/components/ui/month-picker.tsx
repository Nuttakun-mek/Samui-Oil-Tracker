'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react';
import { THAI_MONTHS_SHORT, formatThaiMonth, toBuddhistYear } from '@/lib/format/thai-date';
import { usePopover } from './use-popover';

export function MonthPicker({
  id,
  value,
  onChange,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const [year, month] = value ? value.split('-').map(Number) : [new Date().getFullYear(), null];
  const [viewYear, setViewYear] = useState(year);

  const selectMonth = (monthIndex: number) => {
    onChange(`${viewYear}-${String(monthIndex + 1).padStart(2, '0')}`);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        id={id}
        type="button"
        aria-label={ariaLabel}
        onClick={() => {
          setViewYear(year);
          setOpen((current) => !current);
        }}
        className="field flex items-center justify-between gap-2 text-left"
      >
        <span className={value ? 'text-slate-900' : 'text-slate-400'}>{value ? formatThaiMonth(value) : 'เลือกเดือน'}</span>
        <CalendarRange size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <div className="mb-2 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => setViewYear((current) => current - 1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-brand-50 hover:text-brand-700"
              aria-label="ปีก่อนหน้า"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="text-sm font-extrabold text-slate-950 tabular-nums">{toBuddhistYear(viewYear)}</span>
            <button
              type="button"
              onClick={() => setViewYear((current) => current + 1)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-brand-50 hover:text-brand-700"
              aria-label="ปีถัดไป"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {THAI_MONTHS_SHORT.map((label, index) => {
              const isSelected = year === viewYear && month === index + 1;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => selectMonth(index)}
                  className={`rounded-md px-1 py-2 text-xs font-bold ${
                    isSelected ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-brand-50'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
