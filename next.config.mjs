/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pdfkit'],
  outputFileTracingIncludes: {
    '/api/reports/daily-pdf': [
      './node_modules/pdfkit/js/data/**/*',
      './node_modules/fontkit/src/opentype/shapers/*.trie',
    ],
  },
};

export default nextConfig;
