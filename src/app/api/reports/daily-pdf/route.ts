import { NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getCurrentUserAccess } from '@/lib/auth/server';
import { createDailyFuelPdf } from '@/lib/reports/daily-fuel-pdf';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { STATION_IDS, type FuelRecord, type Station, type StationId } from '@/lib/types/domain';
import { getProcurementSummary } from '@/lib/procurement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function GET(request: NextRequest) {
  const from = validDate(request.nextUrl.searchParams.get('from'));
  const to = validDate(request.nextUrl.searchParams.get('to'));
  if (!from || !to || from > to) return new Response('Invalid date range', { status: 400 });

  // ยังต้องล็อกอินอยู่จึงจะดาวน์โหลดได้ (redirect ไป /login ถ้าไม่มี session)
  const access = await getCurrentUserAccess();

  // รายงาน (ภาพรวม) ให้ทุกบัญชีเห็นทุกพื้นที่ เช่นเดียวกับหน้ารายงาน/แดชบอร์ด
  let supabase: ReturnType<typeof createAdminClient> | Awaited<ReturnType<typeof createClient>>;
  let visibleStationIds: StationId[];
  try {
    supabase = createAdminClient();
    visibleStationIds = [...STATION_IDS];
  } catch {
    supabase = await createClient();
    visibleStationIds = access.stationIds;
  }
  // station รับได้ทั้ง 'all', พื้นที่เดียว, หรือหลายพื้นที่คั่นด้วยจุลภาค (เช่น 'samui,koh_tao') — ให้เลือก 1 / 2 / ทั้งหมดได้
  const requestedStation = request.nextUrl.searchParams.get('station');
  const requestedStationIds =
    requestedStation && requestedStation !== 'all'
      ? requestedStation.split(',').filter((id): id is StationId => visibleStationIds.includes(id as StationId))
      : [];
  const stationIds = requestedStationIds.length ? requestedStationIds : visibleStationIds;
  const forceDailyChart = request.nextUrl.searchParams.get('chartMode') === 'daily';

  const [{ data: stations }, { data: records, error }, procurement] = await Promise.all([
    supabase.from('stations').select('*').in('id', stationIds).order('name'),
    supabase.from('fuel_records').select('*').in('station_id', stationIds).gte('record_date', from).lte('record_date', to).order('record_date').order('created_at').order('station_id'),
    getProcurementSummary(),
  ]);
  if (error) return new Response(error.message, { status: 500 });

  try {
    const thaiFont = await readFile(path.join(process.cwd(), 'public', 'fonts', 'Sarabun-Regular.ttf'));
    const pdf = await createDailyFuelPdf((stations ?? []) as Station[], (records ?? []) as FuelRecord[], from, to, thaiFont, { forceDailyChart, procurement });
    const scope = stationIds.length === visibleStationIds.length ? 'all-stations' : stationIds.join('-');
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="oil-daily-report-${scope}-${from}-to-${to}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (pdfError) {
    console.error('Daily PDF generation failed', pdfError);
    return new Response('Unable to generate PDF report', { status: 500 });
  }
}
