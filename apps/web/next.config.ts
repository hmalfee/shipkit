import { withTelemetrySourceMaps } from '@mento-mark/telemetry/source-maps/next/server';

import { env } from '@/env';

import type { NextConfig } from 'next';

import rootPkgJson from '../../package.json';
import pkgJson from './package.json';

const workspacePackages = Object.keys({
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies,
}).filter((dep) => dep.startsWith(`@${rootPkgJson.name}/`));

const nextConfig: NextConfig = {
    typedRoutes: true,
    reactCompiler: true,
    output: 'standalone',
    transpilePackages: workspacePackages,
    logging: {
        browserToTerminal: true,
    },
};

// No point building source maps if no collectors are configured
export default env.OTEL_URL ? withTelemetrySourceMaps(nextConfig) : nextConfig;
