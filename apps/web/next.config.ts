import os from 'node:os';

import { withRewriteProxy } from '@shipkit/posthog/next';
import { withTelemetrySourceMaps } from '@shipkit/telemetry/source-maps/next/server';

import { env } from '@/env';

import type { NextConfig } from 'next';

import rootPkgJson from '../../package.json';
import pkgJson from './package.json';

const lanIp =
    Object.values(os.networkInterfaces())
        .flat()
        .find((iface) => iface?.family === 'IPv4' && !iface.internal)
        ?.address ?? '127.0.0.1';

const workspacePackages = Object.keys({
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies,
}).filter((dep) => dep.startsWith(`@${rootPkgJson.name}/`));

let nextConfig: NextConfig = {
    typedRoutes: true,
    reactCompiler: true,
    output: 'standalone',
    transpilePackages: workspacePackages,
    logging: {
        browserToTerminal: true,
    },
    env: {
        NEXT_TELEMETRY_DISABLED: '1',
    },
    allowedDevOrigins: [lanIp, lanIp + '.sslip.io'],
};

if (env.NEXT_PUBLIC_POSTHOG_PROXY_PATH) {
    nextConfig = withRewriteProxy(nextConfig, {
        path: env.NEXT_PUBLIC_POSTHOG_PROXY_PATH,
    });
}

if (env.OTEL_URL) {
    nextConfig = withTelemetrySourceMaps(nextConfig);
}

export default nextConfig;
