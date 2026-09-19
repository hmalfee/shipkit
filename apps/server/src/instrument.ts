import { prefetchDisposableDomains } from '@shipkit/auth/email-validation';
import { logger } from '@shipkit/telemetry/logger';
import { initTelemetry } from '@shipkit/telemetry/node';

import pkg from '../package.json';
import { env } from './env';

// Load the disposable-domain list at startup so that the
// auth requests doesn't have to wait for it to load.
await prefetchDisposableDomains();

await initTelemetry({
    serviceName: pkg.name,
    otelEndpoint: env.OTEL_URL,
    ignoredUrls: [env.OTEL_URL].filter((p): p is string => Boolean(p)),
    environment: env.NODE_ENV,
    ignoredScopes: ['better-auth'],
});

process.on('uncaughtException', (err) => {
    logger.error(
        'uncaughtException',
        err instanceof Error ? err : new Error(String(err)),
    );
    process.exit(1);
});
process.on('unhandledRejection', (err) => {
    logger.error(
        'unhandledRejection',
        err instanceof Error ? err : new Error(String(err)),
    );
    process.exit(1);
});
