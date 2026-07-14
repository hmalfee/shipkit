import { logger } from '@shipkit/telemetry/logger';
import { initTelemetry } from '@shipkit/telemetry/node';

import pkg from '../package.json';
import { env } from './env';

await initTelemetry({
    serviceName: pkg.name,
    otelEndpoint: env.OTEL_URL,
    ignoredUrls: [env.OTEL_URL].filter((p): p is string => Boolean(p)),
    environment: env.NODE_ENV,
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
