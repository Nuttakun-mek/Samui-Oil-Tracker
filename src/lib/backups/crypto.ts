import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { BackupPayload, EncryptedBackupEnvelope } from './types';

const TOKEN_PREFIX = 'gdrive-token-v1';

function getMasterKey() {
  const secret = process.env.BACKUP_MASTER_KEY;
  if (!secret || secret.length < 24) {
    throw new Error('ยังไม่ได้ตั้งค่า BACKUP_MASTER_KEY (ต้องมีอย่างน้อย 24 ตัวอักษร)');
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function sha256(data: string | Buffer) {
  return createHash('sha256').update(data).digest('hex');
}

function encryptBuffer(plain: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getMasterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decryptBuffer(iv: string, authTag: string, ciphertext: string) {
  const decipher = createDecipheriv('aes-256-gcm', getMasterKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]);
}

export function encryptRefreshToken(refreshToken: string) {
  const encrypted = encryptBuffer(Buffer.from(refreshToken, 'utf8'));
  return [TOKEN_PREFIX, encrypted.iv, encrypted.authTag, encrypted.ciphertext].join('.');
}

export function decryptRefreshToken(value: string) {
  const [prefix, iv, authTag, ciphertext] = value.split('.');
  if (prefix !== TOKEN_PREFIX || !iv || !authTag || !ciphertext) {
    throw new Error('รูปแบบ Google Drive credential ไม่ถูกต้อง');
  }
  return decryptBuffer(iv, authTag, ciphertext).toString('utf8');
}

export function encodeBackup(payload: BackupPayload) {
  const serialized = Buffer.from(JSON.stringify(payload), 'utf8');
  const payloadSha256 = sha256(serialized);
  const encrypted = encryptBuffer(gzipSync(serialized, { level: 9 }));
  const envelope: EncryptedBackupEnvelope = {
    format: 'pea-oil-backup-encrypted',
    formatVersion: 1,
    algorithm: 'AES-256-GCM',
    compression: 'gzip',
    createdAt: payload.manifest.createdAt,
    payloadSha256,
    ...encrypted,
  };
  return Buffer.from(JSON.stringify(envelope), 'utf8');
}

export function decodeBackup(buffer: Buffer): BackupPayload {
  let envelope: EncryptedBackupEnvelope;
  try {
    envelope = JSON.parse(buffer.toString('utf8')) as EncryptedBackupEnvelope;
  } catch {
    throw new Error('ไฟล์สำรองเสียหายหรือไม่ใช่ไฟล์ .oilbackup');
  }

  if (envelope.format !== 'pea-oil-backup-encrypted' || envelope.formatVersion !== 1) {
    throw new Error('เวอร์ชันไฟล์สำรองนี้ยังไม่รองรับ');
  }

  const serialized = gunzipSync(decryptBuffer(envelope.iv, envelope.authTag, envelope.ciphertext));
  if (sha256(serialized) !== envelope.payloadSha256) {
    throw new Error('Checksum ของข้อมูลในไฟล์สำรองไม่ถูกต้อง');
  }

  const payload = JSON.parse(serialized.toString('utf8')) as BackupPayload;
  if (payload.manifest?.format !== 'pea-oil-backup' || payload.manifest.formatVersion !== 1) {
    throw new Error('Manifest ของไฟล์สำรองไม่ถูกต้อง');
  }
  return payload;
}

