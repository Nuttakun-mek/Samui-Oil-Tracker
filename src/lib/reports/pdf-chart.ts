import type PDFDocument from 'pdfkit';
import type { TrendBucket } from '@/lib/analytics/station-insight';

type Doc = InstanceType<typeof PDFDocument>;

interface ChartArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

const COLOR_RECEIVED = '#2a78d6';
const COLOR_DISPATCHED = '#1baf7a';
const COLOR_CLOSING = '#eda100';
const COLOR_GRID = '#E2E8F0';
const COLOR_AXIS = '#64748B';

// วาดกราฟแนวโน้ม (แท่งรับเข้า/จ่ายออก + เส้นคงเหลือ) ด้วย vector primitives ของ pdfkit ล้วน
// เจตนาเลี่ยง library เรนเดอร์รูปภาพ (เช่น chartjs-node-canvas) เพราะต้องพึ่ง native canvas binding ที่เสี่ยงพังบน Vercel serverless
export function drawTrendChart(doc: Doc, area: ChartArea, buckets: TrendBucket[]) {
  const { x, y, width, height } = area;

  const legendItems = [
    { color: COLOR_RECEIVED, label: 'รับเข้า (ลิตร)' },
    { color: COLOR_DISPATCHED, label: 'ใช้ออก (ลิตร)' },
    { color: COLOR_CLOSING, label: 'คงเหลือ (ลิตร)' },
  ];
  const axisLabelWidth = 48;
  doc.fontSize(6.5).fillColor(COLOR_AXIS).text('ลิตร', x, y + 1, { width: axisLabelWidth - 6, align: 'left' });
  let legendX = x + axisLabelWidth;
  legendItems.forEach((item) => {
    doc.rect(legendX, y + 2, 7, 7).fill(item.color);
    doc.fontSize(7).fillColor('#334155').text(item.label, legendX + 10, y + 1, { lineBreak: false });
    legendX += 78;
  });

  if (!buckets.length) {
    doc.fillColor('#94a3b8').fontSize(9).text('ไม่มีข้อมูลสำหรับกราฟในช่วงที่เลือก', x, y + height / 2, { width, align: 'center' });
    return;
  }

  const legendHeight = 16;
  const bottomLabelHeight = 14;
  const plotX = x + axisLabelWidth;
  const plotWidth = width - axisLabelWidth;
  const plotTop = y + legendHeight;
  const plotHeight = height - legendHeight - bottomLabelHeight;
  const plotBottom = plotTop + plotHeight;

  const maxValue = Math.max(1, ...buckets.map((bucket) => Math.max(bucket.received, bucket.dispatched, bucket.closing)));
  const gridLines = 4;

  for (let i = 0; i <= gridLines; i += 1) {
    const value = (maxValue / gridLines) * i;
    const lineY = plotBottom - (plotHeight * i) / gridLines;
    doc.moveTo(plotX, lineY).lineTo(plotX + plotWidth, lineY).strokeColor(COLOR_GRID).lineWidth(0.5).stroke();
    doc.fontSize(6.5).fillColor(COLOR_AXIS).text(Math.round(value).toLocaleString('th-TH'), x, lineY - 3, { width: axisLabelWidth - 6, align: 'right' });
  }

  const groupWidth = plotWidth / buckets.length;
  const barWidth = Math.max(2, Math.min(16, groupWidth * 0.28));
  const barGap = 3;
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 14));
  const points: { cx: number; cy: number }[] = [];

  buckets.forEach((bucket, index) => {
    const groupX = plotX + groupWidth * index;
    const receivedHeight = (bucket.received / maxValue) * plotHeight;
    const dispatchedHeight = (bucket.dispatched / maxValue) * plotHeight;
    const receivedX = groupX + groupWidth / 2 - barWidth - barGap / 2;
    const dispatchedX = groupX + groupWidth / 2 + barGap / 2;

    doc.rect(receivedX, plotBottom - receivedHeight, barWidth, receivedHeight).fill(COLOR_RECEIVED);
    doc.rect(dispatchedX, plotBottom - dispatchedHeight, barWidth, dispatchedHeight).fill(COLOR_DISPATCHED);

    const closingHeight = (bucket.closing / maxValue) * plotHeight;
    points.push({ cx: groupX + groupWidth / 2, cy: plotBottom - closingHeight });

    if (index % labelEvery === 0) {
      doc.fontSize(6).fillColor(COLOR_AXIS).text(bucket.periodLabel, groupX, plotBottom + 3, { width: groupWidth, align: 'center', lineBreak: false });
    }
  });

  if (points.length > 1) {
    doc.strokeColor(COLOR_CLOSING).lineWidth(1.5);
    points.forEach((point, index) => {
      if (index === 0) doc.moveTo(point.cx, point.cy);
      else doc.lineTo(point.cx, point.cy);
    });
    doc.stroke();
  }
  points.forEach((point) => doc.circle(point.cx, point.cy, 1.6).fill(COLOR_CLOSING));
}
