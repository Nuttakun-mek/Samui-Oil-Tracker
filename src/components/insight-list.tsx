import type { FuelRecord, Station } from '@/lib/types/domain';

export function InsightList({ stations, records }: { stations: Station[]; records: FuelRecord[] }) {
  const byStation = (id: string) => records.filter((r) => r.station_id === id);
  const items: { level: 'ok' | 'warn' | 'danger'; text: string }[] = [];

  stations.forEach((st) => {
    const list = byStation(st.id);
    if (!list.length) return;
    const latest = list[list.length - 1];
    const pct = st.tank_capacity_liters > 0 ? (latest.closing_liters / st.tank_capacity_liters) * 100 : 0;
    const avg7 = list.slice(-7).reduce((a, r) => a + r.dispatched_liters, 0) / Math.min(7, list.length);
    const daysLeft = avg7 > 0 ? latest.closing_liters / avg7 : Infinity;

    if (daysLeft < st.low_stock_days) {
      items.push({
        level: 'danger',
        text: `${st.name} น้ำมันคงเหลือจะใช้ได้อีกประมาณ ${daysLeft.toFixed(1)} วัน ที่อัตราใช้เฉลี่ย ${Math.round(avg7).toLocaleString('th-TH')} ลิตร/วัน จาก 7 วันที่มีบันทึกล่าสุด — ควรเร่งจัดส่งเพิ่ม`,
      });
    } else if (pct < 35) {
      items.push({ level: 'warn', text: `${st.name} ระดับน้ำมันอยู่ที่ ${pct.toFixed(0)}% ของความจุถัง ควรวางแผนรับน้ำมันรอบถัดไป` });
    }

    if (list.length >= 14) {
      const last7 = list.slice(-7).reduce((a, r) => a + r.dispatched_liters, 0);
      const prev7 = list.slice(-14, -7).reduce((a, r) => a + r.dispatched_liters, 0);
      if (prev7 > 0) {
        const change = ((last7 - prev7) / prev7) * 100;
        if (Math.abs(change) >= 15) {
          items.push({
            level: 'ok',
            text: `${st.name} ยอดจ่ายน้ำมัน 7 วันล่าสุด${change > 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(change).toFixed(0)}% เทียบสัปดาห์ก่อน`,
          });
        }
      }
    }
  });

  if (!items.length) {
    items.push({ level: 'ok', text: 'ทุกพื้นที่มีระดับน้ำมันอยู่ในเกณฑ์ปกติ ไม่มีจุดที่ต้องเฝ้าระวังในขณะนี้' });
  }

  const toneClass = {
    ok: 'border-teal-200 bg-teal-50 text-slate-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-950',
    danger: 'border-red-200 bg-red-50 text-red-950',
  };

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <li key={i} className={`rounded-lg border px-3 py-2.5 text-sm leading-6 ${toneClass[it.level]}`}>
          {it.text}
        </li>
      ))}
    </ul>
  );
}
