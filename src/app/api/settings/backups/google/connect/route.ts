import { NextResponse } from 'next/server';
import { createGoogleOAuthState, getGoogleAuthorizationUrl } from '@/lib/backups/google-drive';
import { getRouteAdmin } from '@/lib/backups/route-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getRouteAdmin();
  if (!user) return NextResponse.json({ error: 'Admin permission required' }, { status: 403 });

  try {
    const origin = new URL(request.url).origin;
    const state = createGoogleOAuthState(user.id);
    return NextResponse.redirect(getGoogleAuthorizationUrl(origin, state));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'เริ่มเชื่อม Google Drive ไม่สำเร็จ';
    return NextResponse.redirect(new URL(`/settings?tab=backup&error=${encodeURIComponent(message)}`, request.url));
  }
}

