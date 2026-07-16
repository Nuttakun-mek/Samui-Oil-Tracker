const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0';
const buildSha = process.env.NEXT_PUBLIC_BUILD_SHA ?? 'local';
const environment = process.env.NEXT_PUBLIC_DEPLOY_ENV ?? 'local';

export const APP_RELEASE = {
  version,
  buildSha,
  environment,
  label: `v${version}${buildSha === 'local' ? ' local' : ` + ${buildSha}`}`,
  environmentLabel: environment === 'production' ? 'Production' : environment === 'preview' ? 'Preview' : 'Local',
} as const;
