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

        await initTelemetry({
            serviceName: 'web',
            otelEndpoint: env.OTEL_URL,
            ignoredRoutes: [
                env.NEXT_PUBLIC_OTEL_PROXY_PATH,
                env.NEXT_PUBLIC_POSTHOG_PROXY_PATH,
            ].filter((p): p is string => Boolean(p)),
            ignoredUrls: ['posthog.com', env.OTEL_URL].filter(
                (p): p is string => Boolean(p),
            ),
            environment: env.NODE_ENV,
            extraSpanProcessors: [new SourceMapResolvingSpanProcessor()],
            extraLogProcessors: [new SourceMapResolvingLogProcessor()],
            nextjs: true,
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
