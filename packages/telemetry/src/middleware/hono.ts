import { context, propagation, SpanStatusCode } from '@opentelemetry/api';
import {
    ATTR_HTTP_RESPONSE_STATUS_CODE,
    ATTR_HTTP_ROUTE,
    ATTR_URL_PATH,
} from '@opentelemetry/semantic-conventions';
import { routePath } from 'hono/route';

import type { Span } from '@opentelemetry/api';
import type { Context, MiddlewareHandler } from 'hono';

import { logger } from '../logger';
import { getActiveSpan, startSpan } from '../tracing/spans';

export function telemetry(): MiddlewareHandler {
    return async (c, next) => {
        // Extract context from incoming headers (handles non-Node environments too)
        const extractedContext = propagation.extract(
            context.active(),
            c.req.header(),
        );

        return context.with(extractedContext, async () => {
            // Start a span if one doesn't exist (e.g. non-Node runtime without HttpInstrumentation)
            // or use the existing one from HttpInstrumentation
            const span = getActiveSpan();

            if (!span || !span.isRecording()) {
                // We need to create a root span for this request
                return startSpan(
                    `${c.req.method} ${c.req.path}`,
                    {},
                    async (newSpan) => {
                        return handleRequest(c, next, newSpan);
                    },
                );
            } else {
                return handleRequest(c, next, span);
            }
        });
    };
}

async function handleRequest(
    c: Context,
    next: () => Promise<void>,
    span: Span,
) {
    const startTime = performance.now();

    const method = c.req.method;

    // Create a child logger for this request (will be updated with matched route later)
    const requestLogger = logger.child({ route: c.req.path });
    c.set('logger', requestLogger);

    try {
        await next();

        // UPDATE route and span after next() to get the actual matched route
        const route = routePath(c) || c.req.path;
        span.updateName(`${method} ${route}`);
        span.setAttribute(ATTR_URL_PATH, c.req.path);
        span.setAttribute(ATTR_HTTP_ROUTE, route);

        // Update logger with final route
        c.set('logger', logger.child({ route }));

        span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, c.res.status);
        c.res.headers.append('x-trace-id', span.spanContext().traceId);

        if (c.error) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: c.error.message,
            });
            span.recordException(c.error);
        } else if (c.res.status >= 400) {
            span.setStatus({ code: SpanStatusCode.ERROR });
        }
        // Non-error responses leave status UNSET (OTel convention: UNSET = no error).
        // Setting OK explicitly would prevent downstream code from upgrading to ERROR.

        const durationS = (performance.now() - startTime) / 1000;
        const durationMs = Math.round(durationS * 1000);

        if (c.res.status >= 400) {
            requestLogger.error(
                `${method} ${c.req.path} ${c.res.status} ${durationMs}ms`,
                c.error ? { err: c.error } : undefined,
            );
        } else {
            requestLogger.info(
                `${method} ${c.req.path} ${c.res.status} ${durationMs}ms`,
            );
        }
    } catch (err) {
        // Fallback for non-Hono-handled errors
        const route = routePath(c) || c.req.path;
        span.updateName(`${method} ${route}`);
        span.setAttribute(ATTR_HTTP_ROUTE, route);

        span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (err as Error).message,
        });
        span.recordException(err as Error);

        const durationS = (performance.now() - startTime) / 1000;
        const durationMs = Math.round(durationS * 1000);

        requestLogger.error(`${method} ${c.req.path} 500 ${durationMs}ms`, {
            err,
        });
        throw err;
    }
}
