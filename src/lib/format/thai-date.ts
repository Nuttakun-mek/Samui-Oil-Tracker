export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
] as const;

export const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'] as const;

export const THAI_WEEKDAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'] as const;

export function toBuddhistYear(year: number) {
  return year + 543;
}

function dateParts(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { year, month, day };
}

export function formatThaiDate(isoDate: string) {
  const { year, month, day } = dateParts(isoDate);
  if (!year || !month || !day) return isoDate;
  return `${day} ${THAI_MONTHS[month - 1]} ${year + 543}`;
}

export function formatThaiDateShort(isoDate: string) {
  const { year, month, day } = dateParts(isoDate);
  if (!year || !month || !day) return isoDate;
  return `${day} ${THAI_MONTHS_SHORT[month - 1]} ${String(year + 543).slice(-2)}`;
}

// วันที่ เดือนย่อ พ.ศ. เต็ม 4 หลัก เช่น "14 ก.ค. 2569" — ใช้ในตารางที่ต้องการกระชับกว่า formatThaiDate
// แต่ปีต้องเต็มไม่ย่อ (ต่างจาก formatThaiDateShort ที่ย่อปีเหลือ 2 หลัก)
export function formatThaiDateCompact(isoDate: string) {
  const { year, month, day } = dateParts(isoDate);
  if (!year || !month || !day) return isoDate;
  return `${day} ${THAI_MONTHS_SHORT[month - 1]} ${year + 543}`;
}

export function formatThaiMonth(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return `${THAI_MONTHS_SHORT[month - 1]} ${String(year + 543).slice(-2)}`;
}
