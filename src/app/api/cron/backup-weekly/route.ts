import { runBackup } from '@/lib/backups/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return Response.json(await runBackup('weekly'));
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'Weekly backup failed' },
      { status: 500 }
    );
  }
}

