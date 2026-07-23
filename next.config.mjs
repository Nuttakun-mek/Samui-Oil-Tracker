import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ค่าเริ่มต้นของ Next.js จำกัด request body ของ Server Action ไว้แค่ 1MB — ต่ำกว่าที่แอปโฆษณาไว้ว่าแนบไฟล์ได้ถึง 10MB
  // (MAX_DOCUMENT_BYTES ใน src/lib/documents.ts) ทำให้รูปถ่ายจากมือถือ (มักเกิน 1MB) อัปโหลดไม่ผ่านและพัง
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
    NEXT_PUBLIC_DEPLOY_ENV: process.env.VERCEL_ENV ?? 'local',
  },
  serverExternalPackages: ['pdfkit'],
  outputFileTracingIncludes: {
    '/api/reports/daily-pdf': [
      './node_modules/pdfkit/js/data/**/*',
      './node_modules/fontkit/src/opentype/shapers/*.trie',
    ],
  },
};

export default nextConfig;
