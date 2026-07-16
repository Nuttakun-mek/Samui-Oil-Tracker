import { bangkokDateKey, runBackup } from '@/lib/backups/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!bangkokDateKey(new Date()).endsWith('-01')) {
    return Response.json({ skipped: true, reason: 'not_first_day_in_bangkok' });
  }
  try {
    return Response.json(await runBackup('monthly'));
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'Monthly backup failed' },
      { status: 500 }
    );
  }
}

