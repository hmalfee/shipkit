import { SpanStatusCode, trace } from '@opentelemetry/api';

import type { Span, SpanOptions } from '@opentelemetry/api';

const tracer = trace.getTracer('@shipkit/telemetry');

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
            // OpenTelemetry defaults to UNSET ("no error").
            // We omit setting OK here so we don't accidentally overwrite an ERROR
            // status set manually within the span execution.
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

export function getActiveSpan() {
    return trace.getActiveSpan();
}

const routeTemplates = new WeakMap<Span, string>();

/**
 * Associates an abstract route template (e.g. `/todo/{id}`) with an active span.
 * Used by RPC frameworks (oRPC, tRPC, etc.) to pass the template to a telemetry middleware.
 */
export function setRouteTemplate(span: Span, template: string) {
    routeTemplates.set(span, template);
}

/**
 * Retrieves the abstract route template associated with a span. Set by `setRouteTemplate()`.
 * Used by RPC middlewares (oRPC, tRPC, etc.) to pass the template to telemetry middlewares.
 */
export function getRouteTemplate(span: Span): string | undefined {
    return routeTemplates.get(span);
}
