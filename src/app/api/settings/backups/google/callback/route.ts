import { NextResponse } from 'next/server';
import { encryptRefreshToken } from '@/lib/backups/crypto';
import {
  ensureBackupFolder,
  exchangeGoogleAuthorizationCode,
  getGoogleDriveAccount,
  verifyGoogleOAuthState,
} from '@/lib/backups/google-drive';
import { getRouteAdmin } from '@/lib/backups/route-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getRouteAdmin();
  if (!user) return NextResponse.json({ error: 'Admin permission required' }, { status: 403 });

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    return NextResponse.redirect(new URL(`/settings?tab=backup&error=${encodeURIComponent(oauthError)}`, request.url));
  }
  if (!code || !state || !verifyGoogleOAuthState(state, user.id)) {
    return NextResponse.redirect(new URL('/settings?tab=backup&error=oauth_state_invalid', request.url));
  }

  try {
    const tokens = await exchangeGoogleAuthorizationCode(code, url.origin);
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from('backup_settings')
      .select('google_refresh_token_encrypted,google_drive_folder_id')
      .eq('id', true)
      .single();
    const encryptedRefreshToken = tokens.refresh_token
      ? encryptRefreshToken(tokens.refresh_token)
      : existing?.google_refresh_token_encrypted;
    if (!encryptedRefreshToken) throw new Error('Google ไม่ส่ง refresh token กรุณาถอนสิทธิ์แอปแล้วเชื่อมใหม่');

    const account = await getGoogleDriveAccount(tokens.access_token);
    const folderId = await ensureBackupFolder(tokens.access_token, existing?.google_drive_folder_id);
    const now = new Date().toISOString();
    const { error } = await admin
      .from('backup_settings')
      .update({
        google_connected_email: account.email,
        google_drive_folder_id: folderId,
        google_refresh_token_encrypted: encryptedRefreshToken,
        connected_at: now,
        updated_by: user.id,
        updated_at: now,
      })
      .eq('id', true);
    if (error) throw new Error(error.message);

    return NextResponse.redirect(new URL('/settings?tab=backup&connected=1', request.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'เชื่อม Google Drive ไม่สำเร็จ';
    return NextResponse.redirect(new URL(`/settings?tab=backup&error=${encodeURIComponent(message)}`, request.url));
  }
}

