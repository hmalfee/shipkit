import { withSentryConfig } from '@mento-mark/sentry/next';

import type { NextConfig } from 'next';

import packageJson from './package.json';
import { env } from './src/env';

const workspacePackages = Object.keys({
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
}).filter((dep) => dep.startsWith('@mento-mark/'));

const nextConfig: NextConfig = {
    typedRoutes: true,
    reactCompiler: true,
    output: 'standalone',
    transpilePackages: workspacePackages,
};

export default env.SENTRY_ORG
    ? withSentryConfig(nextConfig, {
          org: env.SENTRY_ORG,
          // since we have allOrNone rule, we can be sure that if SENTRY_ORG is set, then the other two are set as well
          project: env.SENTRY_PROJECT!,
          authToken: env.SENTRY_AUTH_TOKEN!,
          sentryUrl: env.SENTRY_URL,
          releaseName: env.SENTRY_RELEASE,
      })
    : nextConfig;
