import PDFDocument from 'pdfkit';
import { formatThaiDate, formatThaiDateShort } from '@/lib/format/thai-date';
import { STATION_LABEL, type FuelRecord, type Station } from '@/lib/types/domain';
import { estimatedFuelCost } from '@/lib/analytics/fuel';

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 28;
const TABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;

type Column = { label: string; width: number; align?: 'left' | 'right' };
const COLUMNS: Column[] = [
  { label: 'วันที่', width: 62 },
  { label: 'พื้นที่', width: 164 },
  { label: 'ยกมา', width: 72, align: 'right' },
  { label: 'รับเข้า', width: 66, align: 'right' },
  { label: 'พร้อมใช้', width: 72, align: 'right' },
  { label: 'จ่ายออก', width: 68, align: 'right' },
  { label: 'คงเหลือ', width: 72, align: 'right' },
  { label: 'ผู้รายงาน', width: 68 },
  { label: 'แหล่งข้อมูล', width: TABLE_WIDTH - 644 },
];

function number(value: number) {
  return Math.round(value).toLocaleString('th-TH');
}

function sourceLabel(source: FuelRecord['record_source']) {
  if (source === 'database') return 'ฐานข้อมูลย้อนหลัง';
  if (source === 'upload') return 'อัปโหลดไฟล์';
  return 'พนักงานกรอก';
}

export function createDailyFuelPdf(stations: Station[], records: FuelRecord[], from: string, to: string, thaiFont: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN, bufferPages: true, info: { Title: 'รายงานน้ำมันรายวันทุกพื้นที่' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.registerFont('Thai', thaiFont);
    doc.font('Thai');

    const drawTitle = () => {
      doc.fillColor('#0f172a').fontSize(16).text('รายงานน้ำมันเชื้อเพลิงรายวัน - ทุกพื้นที่', MARGIN, MARGIN, { width: TABLE_WIDTH });
      doc.fontSize(9).fillColor('#475569').text(`${formatThaiDate(from)} ถึง ${formatThaiDate(to)}`, MARGIN, MARGIN + 23);
      const totalReceived = records.reduce((sum, record) => sum + record.received_liters, 0);
      const totalDispatched = records.reduce((sum, record) => sum + record.dispatched_liters, 0);
      const totalCost = estimatedFuelCost(stations, records);
      doc.text(`บันทึก ${records.length.toLocaleString('th-TH')} รายการ | รับเข้า ${number(totalReceived)} ลิตร | จ่ายออก ${number(totalDispatched)} ลิตร | งบประมาณ ${totalCost.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`, MARGIN, MARGIN + 38);
      let x = MARGIN;
      stations.forEach((station) => {
        const stationRecords = records.filter((record) => record.station_id === station.id);
        const latest = stationRecords.at(-1);
        const stationCost = estimatedFuelCost([station], stationRecords);
        doc.fillColor('#0f766e').fontSize(8).text(`${STATION_LABEL[station.id]}: ${stationRecords.length.toLocaleString('th-TH')} รายการ${latest ? `, คงเหลือ ${number(latest.closing_liters)} ลิตร` : ''}, งบ ${stationCost.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`, x, MARGIN + 54, { width: TABLE_WIDTH / Math.max(stations.length, 1) - 8 });
        x += TABLE_WIDTH / Math.max(stations.length, 1);
      });
      return MARGIN + 78;
    };

    const drawTableHeader = (y: number) => {
      doc.rect(MARGIN, y, TABLE_WIDTH, 22).fill('#0f172a');
      let x = MARGIN;
      doc.fillColor('#ffffff').fontSize(7.5);
      COLUMNS.forEach((column) => {
        doc.text(column.label, x + 4, y + 6, { width: column.width - 8, align: column.align ?? 'left', lineBreak: false });
        x += column.width;
      });
      return y + 22;
    };

    let y = drawTableHeader(drawTitle());
    records.forEach((record, index) => {
      const rowHeight = 27;
      if (y + rowHeight > PAGE_HEIGHT - 35) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });
        doc.font('Thai');
        doc.fillColor('#475569').fontSize(8).text(`รายงานน้ำมันรายวัน ${formatThaiDate(from)} - ${formatThaiDate(to)}`, MARGIN, 18);
        y = drawTableHeader(32);
      }

      if (index % 2 === 1) doc.rect(MARGIN, y, TABLE_WIDTH, rowHeight).fill('#f8fafc');
      const values = [
        formatThaiDateShort(record.record_date),
        STATION_LABEL[record.station_id],
        number(record.opening_liters),
        number(record.received_liters),
        number(record.opening_liters + record.received_liters),
        number(record.dispatched_liters),
        number(record.closing_liters),
        record.employee_code || '-',
        sourceLabel(record.record_source),
      ];
      let x = MARGIN;
      doc.fillColor('#1e293b').fontSize(7.2);
      COLUMNS.forEach((column, columnIndex) => {
        doc.text(values[columnIndex], x + 4, y + 5, { width: column.width - 8, height: rowHeight - 6, align: column.align ?? 'left', ellipsis: true });
        x += column.width;
      });
      doc.moveTo(MARGIN, y + rowHeight).lineTo(MARGIN + TABLE_WIDTH, y + rowHeight).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      y += rowHeight;
    });

    if (!records.length) {
      doc.fillColor('#64748b').fontSize(11).text('ไม่พบข้อมูลในช่วงวันที่ที่เลือก', MARGIN, y + 24, { width: TABLE_WIDTH, align: 'center' });
    }

    const range = doc.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page += 1) {
      doc.switchToPage(page);
      doc.font('Thai').fillColor('#64748b').fontSize(7).text(`PEA Oil Tracker | หน้า ${page + 1} / ${range.count}`, MARGIN, PAGE_HEIGHT - MARGIN - 10, { width: TABLE_WIDTH, align: 'right' });
    }
    doc.end();
  });
}
