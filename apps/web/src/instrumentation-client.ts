import { initBrowserTelemetry } from '@mento-mark/telemetry/browser';
import {
    createNavigationSpan,
    nextjsBrowserIgnoredUrls,
} from '@mento-mark/telemetry/browser/next';
import {
    DebugIdEnrichingLogProcessor,
    DebugIdEnrichingSpanProcessor,
} from '@mento-mark/telemetry/source-maps/next/client';

import pkg from '../package.json';
import { env } from './env';

initBrowserTelemetry({
    serviceName: pkg.name,
    otelEndpoint: env.NEXT_PUBLIC_OTEL_PROXY_PATH,
    propagateToUrls: [new RegExp(env.NEXT_PUBLIC_SERVER_URL)],
    environment: env.NEXT_PUBLIC_ENV,
    extraSpanProcessors: [new DebugIdEnrichingSpanProcessor()],
    extraLogProcessors: [new DebugIdEnrichingLogProcessor()],
    ignoredUrls: nextjsBrowserIgnoredUrls,
});

export const onRouterTransitionStart = createNavigationSpan;
