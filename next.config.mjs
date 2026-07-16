import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
