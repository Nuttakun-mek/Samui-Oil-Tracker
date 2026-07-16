import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { decryptRefreshToken } from './crypto';
import type { BackupTag, DriveBackupFile } from './types';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const DEFAULT_FOLDER_NAME = 'Oil Tracker Backups';
const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;

function getOAuthConfig(origin?: string) {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('ยังไม่ได้ตั้งค่า GOOGLE_DRIVE_CLIENT_ID และ GOOGLE_DRIVE_CLIENT_SECRET');
  }

  const configuredRedirect = process.env.GOOGLE_DRIVE_REDIRECT_URI;
  const redirectUri = configuredRedirect || (origin ? `${origin}/api/settings/backups/google/callback` : null);
  if (!redirectUri) throw new Error('ไม่พบ Google Drive OAuth redirect URI');

  return { clientId, clientSecret, redirectUri };
}

function getStateSecret() {
  const secret = process.env.BACKUP_MASTER_KEY;
  if (!secret) throw new Error('ยังไม่ได้ตั้งค่า BACKUP_MASTER_KEY');
  return secret;
}

function encodeStatePart(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

export function createGoogleOAuthState(userId: string) {
  const payload = encodeStatePart(
    JSON.stringify({ userId, createdAt: Date.now(), nonce: randomBytes(12).toString('hex') })
  );
  const signature = createHmac('sha256', getStateSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyGoogleOAuthState(state: string, expectedUserId: string) {
  const [payload, signature] = state.split('.');
  if (!payload || !signature) return false;
  const expected = createHmac('sha256', getStateSecret()).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId: string;
      createdAt: number;
    };
    return parsed.userId === expectedUserId && Date.now() - parsed.createdAt < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

export function getGoogleAuthorizationUrl(origin: string, state: string) {
  const { clientId, redirectUri } = getOAuthConfig(origin);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: `${DRIVE_SCOPE} ${EMAIL_SCOPE}`,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function readGoogleError(response: Response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; error_description?: string };
    if (typeof parsed.error === 'string') return parsed.error_description || parsed.error;
    return parsed.error?.message || body;
  } catch {
    return body || `Google API HTTP ${response.status}`;
  }
}

export async function exchangeGoogleAuthorizationCode(code: string, origin: string) {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig(origin);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`เชื่อม Google Drive ไม่สำเร็จ: ${await readGoogleError(response)}`);
  return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

export async function getGoogleAccessToken(encryptedRefreshToken: string) {
  const { clientId, clientSecret } = getOAuthConfig(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3500');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: decryptRefreshToken(encryptedRefreshToken),
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`ขอสิทธิ์ Google Drive ไม่สำเร็จ: ${await readGoogleError(response)}`);
  const token = (await response.json()) as { access_token: string };
  return token.access_token;
}

async function driveFetch(accessToken: string, url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Google Drive: ${await readGoogleError(response)}`);
  return response;
}

export async function getGoogleDriveAccount(accessToken: string) {
  const response = await driveFetch(accessToken, `${DRIVE_API}/about?fields=user(displayName,emailAddress)`);
  const data = (await response.json()) as { user?: { displayName?: string; emailAddress?: string } };
  return {
    displayName: data.user?.displayName || '',
    email: data.user?.emailAddress || '',
  };
}

export async function ensureBackupFolder(accessToken: string, knownFolderId?: string | null) {
  if (knownFolderId) {
    try {
      await driveFetch(accessToken, `${DRIVE_API}/files/${encodeURIComponent(knownFolderId)}?fields=id,trashed`);
      return knownFolderId;
    } catch {
      // The folder may have been removed outside the app. Recreate it below.
    }
  }

  const query = `name = '${DEFAULT_FOLDER_NAME.replaceAll("'", "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchParams = new URLSearchParams({ q: query, spaces: 'drive', fields: 'files(id,name)', pageSize: '10' });
  const search = await driveFetch(accessToken, `${DRIVE_API}/files?${searchParams.toString()}`);
  const existing = (await search.json()) as { files?: Array<{ id: string }> };
  if (existing.files?.[0]?.id) return existing.files[0].id;

  const create = await driveFetch(accessToken, `${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: DEFAULT_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const folder = (await create.json()) as { id: string };
  return folder.id;
}

export async function uploadBackupToDrive(input: {
  accessToken: string;
  folderId: string;
  fileName: string;
  buffer: Buffer;
  sha256: string;
  tags: BackupTag[];
  pinned: boolean;
  createdAt: string;
}) {
  const metadata = {
    name: input.fileName,
    parents: [input.folderId],
    mimeType: 'application/octet-stream',
    appProperties: {
      oilTrackerBackup: 'true',
      backupTags: input.tags.join(','),
      pinned: String(input.pinned),
      sha256: input.sha256,
      createdAt: input.createdAt,
    },
  };
  const start = await driveFetch(input.accessToken, `${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name,size,createdTime,modifiedTime,md5Checksum,appProperties`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/octet-stream',
      'X-Upload-Content-Length': String(input.buffer.length),
    },
    body: JSON.stringify(metadata),
  });
  const uploadUrl = start.headers.get('location');
  if (!uploadUrl) throw new Error('Google Drive ไม่ส่ง resumable upload URL กลับมา');

  let offset = 0;
  while (offset < input.buffer.length) {
    const endExclusive = Math.min(offset + UPLOAD_CHUNK_SIZE, input.buffer.length);
    const chunk = input.buffer.subarray(offset, endExclusive);
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${offset}-${endExclusive - 1}/${input.buffer.length}`,
      },
      body: Uint8Array.from(chunk).buffer,
      cache: 'no-store',
    });

    if (response.status === 308) {
      offset = endExclusive;
      continue;
    }
    if (!response.ok) throw new Error(`อัปโหลด Google Drive ไม่สำเร็จ: ${await readGoogleError(response)}`);
    return response.json() as Promise<Record<string, unknown>>;
  }

  throw new Error('Google Drive ปิดการอัปโหลดโดยไม่ส่งข้อมูลไฟล์กลับมา');
}

export async function listDriveBackups(accessToken: string, folderId: string): Promise<DriveBackupFile[]> {
  const files: DriveBackupFile[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      spaces: 'drive',
      pageSize: '1000',
      orderBy: 'createdTime desc',
      fields: 'nextPageToken,files(id,name,size,createdTime,modifiedTime,md5Checksum,appProperties)',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await driveFetch(accessToken, `${DRIVE_API}/files?${params.toString()}`);
    const data = (await response.json()) as {
      nextPageToken?: string;
      files?: Array<Omit<DriveBackupFile, 'size' | 'appProperties'> & { size?: string; appProperties?: Record<string, string> }>;
    };
    for (const file of data.files ?? []) {
      if (file.appProperties?.oilTrackerBackup !== 'true') continue;
      files.push({ ...file, size: Number(file.size ?? 0), appProperties: file.appProperties ?? {} });
    }
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  return files;
}

export async function downloadDriveFile(accessToken: string, fileId: string) {
  const response = await driveFetch(accessToken, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
  return Buffer.from(await response.arrayBuffer());
}

export async function updateDriveBackupProperties(
  accessToken: string,
  fileId: string,
  properties: Partial<{ tags: BackupTag[]; pinned: boolean }>
) {
  const currentResponse = await driveFetch(
    accessToken,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=appProperties`
  );
  const current = (await currentResponse.json()) as { appProperties?: Record<string, string> };
  const appProperties = {
    ...(current.appProperties ?? {}),
    ...(properties.tags ? { backupTags: properties.tags.join(',') } : {}),
    ...(properties.pinned === undefined ? {} : { pinned: String(properties.pinned) }),
  };
  await driveFetch(accessToken, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,appProperties`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appProperties }),
  });
}

export async function deleteDriveBackup(accessToken: string, fileId: string) {
  await driveFetch(accessToken, `${DRIVE_API}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
}
