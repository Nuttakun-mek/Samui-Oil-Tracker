import PDFDocument from 'pdfkit';
import { formatThaiDate, formatThaiDateShort } from '@/lib/format/thai-date';
import { STATION_IDS, STATION_LABEL, type FuelRecord, type Station } from '@/lib/types/domain';
import { estimatedFuelCost } from '@/lib/analytics/fuel';
import { buildTrendBuckets, computeStationInsights, findAnomalies, suggestPeriodMode, type StationInsight } from '@/lib/analytics/station-insight';
import { drawTrendChart } from './pdf-chart';
import { APP_RELEASE } from '@/lib/app-version';

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 28;
const TABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN - 16;

type Column = { label: string; width: number; align?: 'left' | 'right' };
const COLUMNS: Column[] = [
  { label: 'วันที่', width: 66 },
  { label: 'ยกมา', width: 82, align: 'right' },
  { label: 'รับเข้า', width: 78, align: 'right' },
  { label: 'พร้อมใช้', width: 82, align: 'right' },
  { label: 'จ่ายออก', width: 78, align: 'right' },
  { label: 'คงเหลือ', width: 82, align: 'right' },
  { label: 'ค่าใช้จ่าย', width: 92, align: 'right' },
  { label: 'ผู้รายงาน', width: 82 },
  { label: 'แหล่งข้อมูล', width: TABLE_WIDTH - 642 },
];

const STATUS_LABEL: Record<StationInsight['status'], string> = { danger: 'วิกฤต', warn: 'เฝ้าระวัง', ok: 'ปกติ' };
const STATUS_COLOR: Record<StationInsight['status'], string> = { danger: '#b91c1c', warn: '#a16207', ok: '#0f766e' };

function number(value: number) {
  return Math.round(value).toLocaleString('th-TH');
}

function sourceLabel(source: FuelRecord['record_source']) {
  if (source === 'database') return 'ฐานข้อมูลย้อนหลัง';
  if (source === 'upload') return 'อัปโหลดไฟล์';
  return 'พนักงานกรอก';
}

function buildInsightBullets(stations: Station[], insights: StationInsight[], anomalyCount: number, budget: number) {
  const bullets: string[] = [];
  const withData = insights.filter((item) => item.records.length > 0);

  const highestUsage = [...withData].sort((a, b) => b.dispatched - a.dispatched)[0];
  if (highestUsage) {
    bullets.push(
      `${STATION_LABEL[highestUsage.station.id]} ใช้น้ำมันสูงสุดในช่วงนี้ ${number(highestUsage.dispatched)} ลิตร (${highestUsage.share.toFixed(1)}% ของยอดใช้รวม)`
    );
  }

  withData.forEach((item) => {
    if (item.status === 'danger' && item.etaDate) {
      bullets.push(
        `${STATION_LABEL[item.station.id]} คาดว่าน้ำมันจะเพียงพอถึงวันที่ ${formatThaiDate(item.etaDate)} เท่านั้น (เหลือ ${item.daysRemaining?.toFixed(1)} วัน ต่ำกว่าเกณฑ์เฝ้าระวัง ${item.station.low_stock_days} วัน) ควรวางแผนจัดส่งเพิ่มโดยเร็ว`
      );
    } else if (item.status === 'warn' && item.etaDate) {
      bullets.push(
        `${STATION_LABEL[item.station.id]} เข้าเกณฑ์เฝ้าระวัง คาดใช้ได้อีก ${item.daysRemaining?.toFixed(1)} วัน (ถึงวันที่ ${formatThaiDate(item.etaDate)})`
      );
    }
  });

  const highestBudget = [...withData].sort((a, b) => b.budget - a.budget)[0];
  if (highestBudget && stations.length > 1) {
    bullets.push(
      `งบประมาณโดยประมาณรวม ${budget.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท โดย ${STATION_LABEL[highestBudget.station.id]} มีสัดส่วนสูงสุด ${highestBudget.budget.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`
    );
  } else {
    bullets.push(`งบประมาณโดยประมาณช่วงนี้รวม ${budget.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`);
  }

  withData.forEach((item) => {
    if (item.trendPct !== null && Math.abs(item.trendPct) >= 10) {
      bullets.push(
        `${STATION_LABEL[item.station.id]} มีแนวโน้มการใช้ 7 รายการล่าสุด${item.trendPct > 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(item.trendPct).toFixed(1)}% เทียบช่วงก่อนหน้า`
      );
    }
  });

  if (anomalyCount > 0) {
    bullets.push(`พบ ${anomalyCount.toLocaleString('th-TH')} วันที่ใช้น้ำมันสูงผิดปกติ (เกิน 2 เท่าของค่าเฉลี่ยรายพื้นที่) ควรตรวจสอบสาเหตุ`);
  }

  return bullets.slice(0, 8);
}

function drawExecutiveSummary(doc: InstanceType<typeof PDFDocument>, stations: Station[], records: FuelRecord[], from: string, to: string) {
  doc.fillColor('#0f172a').fontSize(18).text('รายงานสรุปภาพรวมการใช้น้ำมัน', MARGIN, MARGIN);
  const scopeLabel = stations.length === 1 ? STATION_LABEL[stations[0].id] : 'ทุกพื้นที่';
  doc.fontSize(10).fillColor('#475569').text(`${formatThaiDate(from)} ถึง ${formatThaiDate(to)}  ·  ขอบเขต: ${scopeLabel}`, MARGIN, MARGIN + 24);

  const totalReceived = records.reduce((sum, record) => sum + record.received_liters, 0);
  const totalDispatched = records.reduce((sum, record) => sum + record.dispatched_liters, 0);
  const netChange = totalReceived - totalDispatched;
  const usageRatio = totalReceived > 0 ? (totalDispatched / totalReceived) * 100 : 0;
  const budget = estimatedFuelCost(stations, records);

  const kpis = [
    { label: 'บันทึกทั้งหมด', value: `${records.length.toLocaleString('th-TH')} รายการ` },
    { label: 'รับเข้ารวม', value: `${number(totalReceived)} ลิตร` },
    { label: 'จ่ายออกรวม', value: `${number(totalDispatched)} ลิตร` },
    { label: 'สมดุลรับ-ใช้', value: `${netChange >= 0 ? '+' : ''}${number(netChange)} ลิตร` },
    { label: 'งบประมาณโดยประมาณ', value: `${budget.toLocaleString('th-TH', { maximumFractionDigits: 0 })} บาท` },
  ];
  const kpiY = MARGIN + 46;
  const kpiHeight = 42;
  const kpiGap = 8;
  const kpiWidth = (TABLE_WIDTH - kpiGap * (kpis.length - 1)) / kpis.length;
  kpis.forEach((kpi, index) => {
    const kpiX = MARGIN + index * (kpiWidth + kpiGap);
    doc.roundedRect(kpiX, kpiY, kpiWidth, kpiHeight, 4).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.fontSize(7.5).fillColor('#64748b').text(kpi.label, kpiX + 8, kpiY + 7, { width: kpiWidth - 16 });
    doc.fontSize(11).fillColor('#0f172a').text(kpi.value, kpiX + 8, kpiY + 20, { width: kpiWidth - 16 });
  });
  doc.fontSize(8).fillColor('#475569').text(`อัตราใช้ออกเทียบรับเข้า ${usageRatio.toFixed(1)}%`, MARGIN, kpiY + kpiHeight + 6);

  const chartY = kpiY + kpiHeight + 22;
  const chartHeight = 168;
  const periodMode = suggestPeriodMode(from, to);
  const buckets = buildTrendBuckets(records, periodMode);
  drawTrendChart(doc, { x: MARGIN, y: chartY, width: TABLE_WIDTH, height: chartHeight }, buckets);

  const insights = computeStationInsights(stations, records);
  const cardY = chartY + chartHeight + 14;
  const cardHeight = 92;
  const cardGap = 10;
  const cardWidth = (TABLE_WIDTH - cardGap * (insights.length - 1)) / Math.max(insights.length, 1);
  insights.forEach((item, index) => {
    const cardX = MARGIN + index * (cardWidth + cardGap);
    doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 4).fillAndStroke('#ffffff', '#e2e8f0');
    doc.fontSize(9.5).fillColor('#0f172a').text(STATION_LABEL[item.station.id], cardX + 8, cardY + 7, { width: cardWidth - 16 });
    doc.fontSize(7).fillColor(STATUS_COLOR[item.status]).text(STATUS_LABEL[item.status], cardX + 8, cardY + 21);
    doc.fontSize(7.5).fillColor('#334155').text(
      [
        `คงเหลือ ${number(item.closing)} ลิตร`,
        item.daysRemaining !== null ? `ใช้ได้อีก ${item.daysRemaining.toFixed(1)} วัน${item.etaDate ? ` (ถึง ${formatThaiDate(item.etaDate)})` : ''}` : 'ยังไม่มีข้อมูลพอประเมิน',
        `งบประมาณ ${item.budget.toLocaleString('th-TH', { maximumFractionDigits: 0 })} บาท`,
        item.trendPct !== null ? `แนวโน้ม 7 รายการล่าสุด ${item.trendPct > 0 ? '+' : ''}${item.trendPct.toFixed(1)}%` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      cardX + 8,
      cardY + 33,
      { width: cardWidth - 16, lineGap: 2 }
    );
  });

  const anomalies = findAnomalies(stations, records);
  const bullets = buildInsightBullets(stations, insights, anomalies.length, budget);
  const bulletY = cardY + cardHeight + 14;
  doc.fontSize(10.5).fillColor('#0f172a').text('ข้อสังเกตสำหรับผู้บริหาร', MARGIN, bulletY);
  let lineY = bulletY + 16;
  doc.fontSize(8.3).fillColor('#1e293b');
  for (const bullet of bullets) {
    if (lineY > CONTENT_BOTTOM - 10) break;
    doc.text(`•  ${bullet}`, MARGIN, lineY, { width: TABLE_WIDTH, lineGap: 2 });
    lineY = doc.y + 3;
  }
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

    drawExecutiveSummary(doc, stations, records, from, to);

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

    const orderedStations = [...stations].sort((a, b) => STATION_IDS.indexOf(a.id) - STATION_IDS.indexOf(b.id));
    orderedStations.forEach((station) => {
      const stationRecords = records.filter((record) => record.station_id === station.id);
      const stationReceived = stationRecords.reduce((sum, record) => sum + record.received_liters, 0);
      const stationDispatched = stationRecords.reduce((sum, record) => sum + record.dispatched_liters, 0);
      const stationCost = estimatedFuelCost([station], stationRecords);
      const latestClosing = stationRecords.at(-1)?.closing_liters;
      const insight = computeStationInsights([station], stationRecords)[0];
      const anomalies = findAnomalies([station], stationRecords);
      const stationBuckets = buildTrendBuckets(stationRecords, suggestPeriodMode(from, to));
      const sourceCounts = stationRecords.reduce<Record<FuelRecord['record_source'], number>>(
        (counts, record) => ({ ...counts, [record.record_source]: counts[record.record_source] + 1 }),
        { manual: 0, upload: 0, database: 0 }
      );

      const drawStationOverview = () => {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });
        doc.font('Thai');
        doc.fillColor('#722257').fontSize(16).text(STATION_LABEL[station.id], MARGIN, MARGIN, { width: TABLE_WIDTH - 110 });
        doc.fontSize(9).fillColor('#475569').text(`ภาพรวมและกราฟวิเคราะห์  ·  ${formatThaiDate(from)} ถึง ${formatThaiDate(to)}`, MARGIN, MARGIN + 24);
        doc.roundedRect(PAGE_WIDTH - MARGIN - 92, MARGIN, 92, 24, 4).fillAndStroke(
          insight.status === 'danger' ? '#fef2f2' : insight.status === 'warn' ? '#fffbeb' : '#ecfdf5',
          STATUS_COLOR[insight.status]
        );
        doc.fontSize(8).fillColor(STATUS_COLOR[insight.status]).text(`สถานะ: ${STATUS_LABEL[insight.status]}`, PAGE_WIDTH - MARGIN - 86, MARGIN + 7, { width: 80, align: 'center' });

        const stationKpis = [
          { label: 'รับเข้ารวม', value: `${number(stationReceived)} ลิตร` },
          { label: 'จ่ายออกรวม', value: `${number(stationDispatched)} ลิตร` },
          { label: 'คงเหลือล่าสุด', value: latestClosing === undefined ? '-' : `${number(latestClosing)} ลิตร` },
          { label: 'ใช้เฉลี่ย 7 รายการล่าสุด', value: `${number(insight.averageDaily)} ลิตร/วัน` },
          { label: 'ประมาณการใช้ได้อีก', value: insight.daysRemaining === null ? 'ข้อมูลไม่เพียงพอ' : `${insight.daysRemaining.toFixed(1)} วัน` },
          { label: 'งบประมาณโดยประมาณ', value: `${stationCost.toLocaleString('th-TH', { maximumFractionDigits: 0 })} บาท` },
        ];
        const kpiY = MARGIN + 52;
        const kpiGap = 7;
        const kpiWidth = (TABLE_WIDTH - kpiGap * (stationKpis.length - 1)) / stationKpis.length;
        stationKpis.forEach((kpi, index) => {
          const x = MARGIN + index * (kpiWidth + kpiGap);
          doc.roundedRect(x, kpiY, kpiWidth, 43, 4).fillAndStroke('#f8fafc', '#e2e8f0');
          doc.fontSize(7).fillColor('#64748b').text(kpi.label, x + 7, kpiY + 7, { width: kpiWidth - 14 });
          doc.fontSize(9.5).fillColor('#0f172a').text(kpi.value, x + 7, kpiY + 22, { width: kpiWidth - 14, ellipsis: true });
        });

        const chartY = kpiY + 58;
        doc.fontSize(10).fillColor('#0f172a').text('แนวโน้มรับเข้า จ่ายออก และคงเหลือ', MARGIN, chartY);
        drawTrendChart(doc, { x: MARGIN, y: chartY + 17, width: TABLE_WIDTH, height: 174 }, stationBuckets);

        const insightY = chartY + 204;
        doc.fontSize(10).fillColor('#0f172a').text('ข้อมูลสำคัญในช่วงที่เลือก', MARGIN, insightY);
        const netChange = stationReceived - stationDispatched;
        const insightLines = [
          insight.peak
            ? `วันที่ใช้สูงสุด ${formatThaiDate(insight.peak.record_date)} จำนวน ${number(insight.peak.dispatched_liters)} ลิตร`
            : 'ยังไม่มีข้อมูลวันที่ใช้สูงสุด',
          `สมดุลรับเข้าเทียบจ่ายออก ${netChange >= 0 ? '+' : ''}${number(netChange)} ลิตร`,
          insight.trendPct === null
            ? 'ข้อมูลยังไม่เพียงพอสำหรับเปรียบเทียบแนวโน้ม 7 รายการล่าสุด'
            : `แนวโน้มการใช้ 7 รายการล่าสุด${insight.trendPct >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(insight.trendPct).toFixed(1)}% จากช่วงก่อนหน้า`,
          insight.daysRemaining !== null && insight.etaDate
            ? `คาดว่าใช้ได้อีก ${insight.daysRemaining.toFixed(1)} วัน หรือถึงประมาณ ${formatThaiDate(insight.etaDate)}`
            : 'ยังประเมินจำนวนวันที่ใช้ได้ไม่เพียงพอ',
          anomalies.length
            ? `พบวันที่ใช้น้ำมันสูงผิดปกติ ${anomalies.length.toLocaleString('th-TH')} วัน (มากกว่า 2 เท่าของค่าเฉลี่ย)`
            : 'ไม่พบวันที่ใช้น้ำมันสูงเกิน 2 เท่าของค่าเฉลี่ย',
        ];
        doc.fontSize(8).fillColor('#1e293b');
        let lineY = insightY + 17;
        insightLines.forEach((line) => {
          doc.text(`•  ${line}`, MARGIN, lineY, { width: TABLE_WIDTH * 0.66, lineGap: 1 });
          lineY = doc.y + 3;
        });

        const sourceX = MARGIN + TABLE_WIDTH * 0.7;
        doc.roundedRect(sourceX, insightY, TABLE_WIDTH * 0.3, 90, 4).fillAndStroke('#ffffff', '#e2e8f0');
        doc.fontSize(9).fillColor('#0f172a').text('คุณภาพและที่มาของข้อมูล', sourceX + 9, insightY + 9, { width: TABLE_WIDTH * 0.3 - 18 });
        doc.fontSize(7.5).fillColor('#475569').text(
          [
            `วันที่มีข้อมูล ${insight.activeDays.toLocaleString('th-TH')} วัน`,
            `พนักงานกรอก ${sourceCounts.manual.toLocaleString('th-TH')} รายการ`,
            `อัปโหลดไฟล์ ${sourceCounts.upload.toLocaleString('th-TH')} รายการ`,
            `ฐานข้อมูลย้อนหลัง ${sourceCounts.database.toLocaleString('th-TH')} รายการ`,
            `ราคาคำนวณ ${station.fuel_price_per_liter.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท/ลิตร`,
          ].join('\n'),
          sourceX + 9,
          insightY + 27,
          { width: TABLE_WIDTH * 0.3 - 18, lineGap: 2 }
        );
      };

      const drawStationHeading = (continued = false) => {
        doc.fillColor('#722257').fontSize(14).text(`รายละเอียดรายวัน - ${STATION_LABEL[station.id]}${continued ? ' (ต่อ)' : ''}`, MARGIN, MARGIN, { width: TABLE_WIDTH });
        doc.fontSize(8.5).fillColor('#475569').text(`${formatThaiDate(from)} ถึง ${formatThaiDate(to)}`, MARGIN, MARGIN + 22);
        doc.fontSize(8.5).fillColor('#1e293b').text(
          `บันทึก ${stationRecords.length.toLocaleString('th-TH')} รายการ  |  รับเข้า ${number(stationReceived)} ลิตร  |  จ่ายออก ${number(stationDispatched)} ลิตร  |  คงเหลือล่าสุด ${latestClosing === undefined ? '-' : `${number(latestClosing)} ลิตร`}  |  ค่าใช้จ่าย ${stationCost.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`,
          MARGIN,
          MARGIN + 38,
          { width: TABLE_WIDTH }
        );
        return MARGIN + 58;
      };

      drawStationOverview();
      doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });
      doc.font('Thai');
      let y = drawTableHeader(drawStationHeading());

      stationRecords.forEach((record, index) => {
        const rowHeight = 27;
        if (y + rowHeight > PAGE_HEIGHT - 35) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });
          doc.font('Thai');
          y = drawTableHeader(drawStationHeading(true));
        }

        if (index % 2 === 1) doc.rect(MARGIN, y, TABLE_WIDTH, rowHeight).fill('#f8fafc');
        const values = [
          formatThaiDateShort(record.record_date),
          number(record.opening_liters),
          number(record.received_liters),
          number(record.opening_liters + record.received_liters),
          number(record.dispatched_liters),
          number(record.closing_liters),
          (record.dispatched_liters * station.fuel_price_per_liter).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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

      if (!stationRecords.length) {
        doc.fillColor('#64748b').fontSize(11).text('ไม่พบข้อมูลของพื้นที่นี้ในช่วงวันที่ที่เลือก', MARGIN, y + 28, { width: TABLE_WIDTH, align: 'center' });
      }
    });

    const range = doc.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page += 1) {
      doc.switchToPage(page);
      doc.font('Thai').fillColor('#64748b').fontSize(7).text('แผนกแผนบริหารความต่อเนื่องทางธุรกิจ การไฟฟ้าส่วนภูมิภาค โทร. 9517', MARGIN, PAGE_HEIGHT - MARGIN - 10, { width: TABLE_WIDTH * 0.65 });
      doc.text(`Island Oil Tracker ${APP_RELEASE.label} | หน้า ${page - range.start + 1} / ${range.count}`, MARGIN, PAGE_HEIGHT - MARGIN - 10, { width: TABLE_WIDTH, align: 'right' });
    }
    doc.end();
  });
}
