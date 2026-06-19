import { trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/react';

interface SentryOptions {
    /** Sentry project DSN */
    dsn: string;
    /** Tunnel route path to bypass ad-blockers (e.g., '/api/ingest-st') */
    tunnel?: string;
}

/**
 * Initialize Sentry for the client-side (React/Browser).
 */
export function initSentry(opts: SentryOptions): void {
    Sentry.init({
        dsn: opts.dsn,
        tunnel: opts.tunnel,
        // oxlint-disable-next-line eslint-js/no-restricted-syntax
        environment: process.env.NODE_ENV,
        integrations: [
            Sentry.replayIntegration({
                maskAllText: false,
                maskAllInputs: true,
                maxReplayDuration: 60_000 * 5, // 5 minutes
            }),
        ],
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

        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1,
    });
}

export const captureException = (error: Error & { digest?: string }) => {
    // RSC errors have a digest prop and are auto-captured on the server.
    // We skip them here to avoid duplicate error reports.
    if (error?.digest) return;
    Sentry.captureException(error);
};
