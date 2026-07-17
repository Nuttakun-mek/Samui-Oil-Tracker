'use client';

import { useEffect, useState } from 'react';

function stripCommas(value: string) {
  return value.replace(/,/g, '');
}

function formatWithCommas(raw: string) {
  if (raw === '') return '';
  const [integerPart, decimalPart] = raw.split('.');
  const grouped = (integerPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimalPart !== undefined ? `${grouped}.${decimalPart}` : grouped;
}

/**
 * ช่องกรอกตัวเลขแบบมีเครื่องหมายคั่นหลักขณะพิมพ์ (10000 → 10,000)
 * - โฟกัสตอนค่าเป็น 0: เคลียร์ช่องให้อัตโนมัติ ไม่ต้องกดลบเอง
 * - ปล่อยช่องว่างแล้วออกจากช่อง: กลับเป็น 0
 */
export function NumberInput({
  value,
  onChange,
  className = 'field',
  placeholder,
  id,
}: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  id?: string;
}) {
  const [display, setDisplay] = useState(() => formatWithCommas(String(value ?? 0)));

  // sync จากภายนอก (เช่น ฟอร์ม reset หลังบันทึก) — ไม่ทับขณะกำลังพิมพ์ค่าเดียวกัน
  useEffect(() => {
    const current = Number(stripCommas(display)) || 0;
    if (current !== (value ?? 0)) {
      setDisplay(formatWithCommas(String(value ?? 0)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={`${className} text-right tabular-nums`}
      placeholder={placeholder}
      value={display}
      onFocus={() => {
        if ((Number(stripCommas(display)) || 0) === 0) setDisplay('');
      }}
      onBlur={() => {
        const clean = stripCommas(display);
        if (clean === '' || clean === '.' || Number.isNaN(Number(clean))) {
          setDisplay('0');
          onChange(0);
        } else {
          setDisplay(formatWithCommas(clean));
          onChange(Number(clean));
        }
      }}
      onChange={(event) => {
        const clean = stripCommas(event.target.value);
        if (!/^\d*\.?\d*$/.test(clean)) return; // รับเฉพาะตัวเลขและจุดทศนิยม
        setDisplay(formatWithCommas(clean));
        onChange(clean === '' || clean === '.' ? 0 : Number(clean));
      }}
    />
  );
}
