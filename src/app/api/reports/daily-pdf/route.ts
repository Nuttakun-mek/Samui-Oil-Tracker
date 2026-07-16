import { NextRequest } from 'next/server';
import { getCurrentUserAccess } from '@/lib/auth/server';
import { createDailyFuelPdf } from '@/lib/reports/daily-fuel-pdf';
import { createClient } from '@/lib/supabase/server';
import type { FuelRecord, Station, StationId } from '@/lib/types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function GET(request: NextRequest) {
  const from = validDate(request.nextUrl.searchParams.get('from'));
  const to = validDate(request.nextUrl.searchParams.get('to'));
  if (!from || !to || from > to) return new Response('Invalid date range', { status: 400 });

  const access = await getCurrentUserAccess();
  const requestedStation = request.nextUrl.searchParams.get('station');
  const stationIds = requestedStation && access.stationIds.includes(requestedStation as StationId)
    ? [requestedStation as StationId]
    : access.stationIds;
  const supabase = await createClient();
  const [{ data: stations }, { data: records, error }] = await Promise.all([
    supabase.from('stations').select('*').in('id', stationIds).order('name'),
    supabase.from('fuel_records').select('*').in('station_id', stationIds).gte('record_date', from).lte('record_date', to).order('record_date').order('station_id'),
  ]);
  if (error) return new Response(error.message, { status: 500 });

  const fontResponse = await fetch(new URL('/fonts/Sarabun-Regular.ttf', request.nextUrl.origin), { cache: 'force-cache' });
  if (!fontResponse.ok) return new Response('Unable to load PDF font', { status: 500 });
  const thaiFont = Buffer.from(await fontResponse.arrayBuffer());
  const pdf = await createDailyFuelPdf((stations ?? []) as Station[], (records ?? []) as FuelRecord[], from, to, thaiFont);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="oil-daily-report-${from}-to-${to}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
