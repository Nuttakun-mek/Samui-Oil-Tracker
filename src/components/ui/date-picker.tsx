'use client';

import { DayPicker } from 'react-day-picker';
import { CalendarDays } from 'lucide-react';
import { THAI_MONTHS, THAI_WEEKDAYS_SHORT, formatThaiDate, toBuddhistYear } from '@/lib/format/thai-date';
import { usePopover } from './use-popover';

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromIsoDate(value: string) {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}

const dayPickerClassNames = {
  months: 'flex',
  month: 'space-y-2',
  month_caption: 'flex items-center justify-center h-9 px-9 text-sm font-extrabold text-slate-950',
  nav: 'flex items-center justify-between absolute inset-x-1 top-0 h-9',
  button_previous: 'inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-30',
  button_next: 'inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-30',
  chevron: 'h-4 w-4 fill-current',
  month_grid: 'w-full border-collapse',
  weekdays: 'flex',
  weekday: 'w-9 text-center text-[11px] font-bold text-slate-400',
  weeks: '',
  week: 'flex',
  day: 'p-0.5',
  day_button: 'flex h-8 w-8 items-center justify-center rounded-md text-sm text-slate-700 hover:bg-brand-50',
  today: '[&>button]:font-extrabold [&>button]:text-brand-700',
  selected: '[&>button]:bg-brand-600 [&>button]:text-white [&>button]:hover:bg-brand-700',
  outside: '[&>button]:text-slate-300',
  disabled: '[&>button]:text-slate-300 [&>button]:hover:bg-transparent [&>button]:cursor-not-allowed',
};

export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  ariaLabel?: string;
}) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const disabledMatchers = [
    ...(min ? [{ before: fromIsoDate(min)! }] : []),
    ...(max ? [{ after: fromIsoDate(max)! }] : []),
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        id={id}
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        className="field flex items-center justify-between gap-2 text-left"
      >
        <span className={value ? 'text-slate-900' : 'text-slate-400'}>{value ? formatThaiDate(value) : 'เลือกวันที่'}</span>
        <CalendarDays size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <DayPicker
            mode="single"
            selected={fromIsoDate(value)}
            defaultMonth={fromIsoDate(value) ?? new Date()}
            onSelect={(date) => {
              if (!date) return;
              onChange(toIsoDate(date));
              setOpen(false);
            }}
            disabled={disabledMatchers.length ? disabledMatchers : undefined}
            formatters={{
              formatCaption: (month) => `${THAI_MONTHS[month.getMonth()]} ${toBuddhistYear(month.getFullYear())}`,
              formatWeekdayName: (weekday) => THAI_WEEKDAYS_SHORT[weekday.getDay()],
            }}
            classNames={dayPickerClassNames}
          />
        </div>
      )}
    </div>
  );
}
