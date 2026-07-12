import { initBrowserTelemetry } from '@mento-mark/telemetry/browser';
import {
    DebugIdEnrichingLogProcessor,
    DebugIdEnrichingSpanProcessor,
} from '@mento-mark/telemetry/source-maps/next/client';

import pkg from '../package.json';
import { env } from './env';

initBrowserTelemetry({
    serviceName: pkg.name,
    otelEndpoint: env.NEXT_PUBLIC_OTEL_PROXY_PATH,
    environment: env.NEXT_PUBLIC_ENV,
    extraSpanProcessors: [new DebugIdEnrichingSpanProcessor()],
    extraLogProcessors: [new DebugIdEnrichingLogProcessor()],
    nextjs: true,
});
