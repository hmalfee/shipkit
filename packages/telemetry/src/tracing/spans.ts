import {
    context,
    propagation,
    SpanStatusCode,
    trace,
} from '@opentelemetry/api';

import type { Span, SpanOptions } from '@opentelemetry/api';

export const tracer = trace.getTracer('@mento-mark/telemetry');

/**
 * Starts a new active span.
 *
 * @warning Do NOT use high-cardinality data (like user IDs or UUIDs) in the span name.
 * Use a static, low-cardinality name (e.g. 'process_payment', 'GET /users')
 * and put dynamic data into span attributes.
 */
export function startSpan<T>(
    name: string,
    options: SpanOptions = {},
    fn: (span: Span) => Promise<T>,
): Promise<T> {
    return tracer.startActiveSpan(name, options, async (span) => {
        try {
            const result = await fn(span);
            // Only set OK if the span hasn't already been marked as ERROR
            // (Since OpenTelemetry JS doesn't expose a clean way to read the status code,
            // we'll just set OK. But wait, if someone set ERROR, we shouldn't overwrite it.)
            // Actually, we can just omit setting OK. The default is UNSET, which means "no error".
            // If they explicitly set ERROR, it will remain ERROR.
            // Let's just remove the unconditional SetStatus OK!
            return result;
        } catch (err) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: err instanceof Error ? err.message : String(err),
            });
            span.recordException(err as Error);
            throw err;
        } finally {
            span.end();
        }
    });
}

/**
 * Adds an event to the currently active span.
 * Events are point-in-time markers within a span, ideal for logging discrete occurrences
 * (e.g. 'payment.attempt', 'cache.miss') without creating a full child span.
 */
export function addSpanEvent(
    name: string,
    attributes?: Record<string, string | number | boolean>,
) {
    const span = trace.getActiveSpan();
    if (span) {
        span.addEvent(name, attributes);
    }
}

/**
 * Evaluates a function within a new context containing the provided baggage entries.
 * Baggage propagates to downstream services.
 *
 * @warning Do not put sensitive data (PII, credentials) in baggage, as it travels
 * in HTTP headers. Keep baggage small to avoid header bloat.
 */
export function withBaggage<T>(
    entries: Record<string, string>,
    fn: () => T,
): T {
    let currentBaggage =
        propagation.getBaggage(context.active()) ?? propagation.createBaggage();

    for (const [key, value] of Object.entries(entries)) {
        currentBaggage = currentBaggage.setEntry(key, { value });
    }

    const newContext = propagation.setBaggage(context.active(), currentBaggage);
    return context.with(newContext, fn);
}

/**
 * Retrieves a value from the current W3C Baggage.
 */
export function getBaggageValue(key: string): string | undefined {
    const baggage = propagation.getBaggage(context.active());
    return baggage?.getEntry(key)?.value;
}

export function getActiveSpan() {
    return trace.getActiveSpan();
}

export function getTraceContext() {
    const span = trace.getActiveSpan();
    if (!span) return undefined;
    return span.spanContext();
}
