import { logger } from '@mento-mark/telemetry/logger';

import type { Instrumentation } from 'next';

export async function register() {
    // oxlint-disable-next-line eslint-js/no-restricted-syntax
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { env } = await import('./env');
        const { initTelemetry } = await import('@mento-mark/telemetry/node');
        const {
            SourceMapResolvingLogProcessor,
            SourceMapResolvingSpanProcessor,
        } = await import('@mento-mark/telemetry/source-maps/next/server');
        const { nextjsRouteExtractor, nextjsSpanFilters } =
            await import('@mento-mark/telemetry/node/next');

        await initTelemetry({
            serviceName: 'web',
            otelEndpoint: env.OTEL_URL,
            ignoredRoutes: ['/api/otel'],
            environment: env.NODE_ENV,
            extraSpanProcessors: [new SourceMapResolvingSpanProcessor()],
            extraLogProcessors: [new SourceMapResolvingLogProcessor()],
            spanFilters: nextjsSpanFilters,
            routeExtractors: [nextjsRouteExtractor],
        });
    }
}

export const onRequestError: Instrumentation.onRequestError = async (
    err,
    errRequest,
    errContext,
) => {
    logger.error('[Server Error]', {
        error: err,
        ...errRequest,
        ...errContext,
    });
};
