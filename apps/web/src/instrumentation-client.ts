import { initPostHogWebAnalytics } from '@shipkit/posthog';
import { initBrowserTelemetry } from '@shipkit/telemetry/browser';
import {
    DebugIdEnrichingLogProcessor,
    DebugIdEnrichingSpanProcessor,
} from '@shipkit/telemetry/source-maps/next/client';

import pkg from '../package.json';
import { env } from './env';

initBrowserTelemetry({
    serviceName: pkg.name,
    otelEndpoint: env.NEXT_PUBLIC_OTEL_PROXY_PATH,
    environment: env.NEXT_PUBLIC_ENV,
    extraSpanProcessors: [new DebugIdEnrichingSpanProcessor()],
    extraLogProcessors: [new DebugIdEnrichingLogProcessor()],
    nextjs: true,
    ignoredUrls: [env.NEXT_PUBLIC_POSTHOG_PROXY_PATH].filter((p): p is string =>
        Boolean(p),
    ),
});

if (env.NEXT_PUBLIC_POSTHOG_KEY) {
    initPostHogWebAnalytics({
        apiKey: env.NEXT_PUBLIC_POSTHOG_KEY,
        apiHost: env.NEXT_PUBLIC_POSTHOG_PROXY_PATH,
        urlIgnoreList: [/^\/auth\/callback/], // Ignore auth callback UI/pages
    });
}
