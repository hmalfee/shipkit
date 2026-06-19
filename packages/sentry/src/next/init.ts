import { trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/nextjs';

interface SentryServerOptions {
    /** Sentry project DSN */
    dsn: string;
}

/**
 * Initialize Sentry for the Next.js server runtime (Node.js).
 * Call this inside `register()` in instrumentation.ts when NEXT_RUNTIME === 'nodejs'.
 *
 * Configures error monitoring only — no performance tracing.
 */
export function initSentryServer(opts: SentryServerOptions): void {
    Sentry.init({
        dsn: opts.dsn,
        // oxlint-disable-next-line eslint-js/no-restricted-syntax
        environment: process.env.NODE_ENV,
        beforeSend(event, _hint) {
            const span = trace.getActiveSpan();
            if (span) {
                const spanContext = span.spanContext();
                event.contexts = {
                    ...event.contexts,
                    trace: {
                        trace_id: spanContext.traceId,
                        span_id: spanContext.spanId,
                    },
                };
            }
            return event;
        },
        skipOpenTelemetrySetup: true,
    });
}

export { captureRequestError } from '@sentry/nextjs';
