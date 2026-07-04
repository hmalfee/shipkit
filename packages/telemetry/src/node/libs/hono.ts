import { context, propagation, SpanStatusCode } from '@opentelemetry/api';
import {
    ATTR_HTTP_RESPONSE_STATUS_CODE,
    ATTR_HTTP_ROUTE,
    ATTR_URL_PATH,
} from '@opentelemetry/semantic-conventions';
import { routePath } from 'hono/route';

import type { Span } from '@opentelemetry/api';
import type { Context, MiddlewareHandler } from 'hono';

import { logger } from '../../logger';
import { PROPAGATION_HEADERS } from '../../shared';
import { getActiveSpan, getRouteTemplate, startSpan } from '../spans';

const TELEMETRY_MOUNTED = Symbol('telemetry_mounted');
// oxlint-disable-next-line eslint-js/no-restricted-syntax
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Hono middleware that adds OpenTelemetry tracing and logging to requests.
 * Extracts propagation context from headers, manages the active span for the request lifecycle,
 * and logs request details (method, route, status, duration) in non-production environments only.
 * It does not log raw error objects.
 * It also attaches the `x-trace-id` header to responses and handles CORS allowed headers for propagation.
 */
export function traceHonoRequest(): MiddlewareHandler {
    return async (c, next) => {
        if (c.req.method === 'OPTIONS') {
            return next();
        }

        const startTime = performance.now();
        const req = c.req.raw as Request & {
            [TELEMETRY_MOUNTED]?: boolean;
        };
        if (req[TELEMETRY_MOUNTED]) {
            return next();
        }
        req[TELEMETRY_MOUNTED] = true;

        const extractedContext = propagation.extract(
            context.active(),
            c.req.header(),
        );

        return context.with(extractedContext, async () => {
            const span = getActiveSpan();

            if (!span || !span.isRecording()) {
                return startSpan(
                    `${c.req.method} ${c.req.path}`,
                    {},
                    async (newSpan) => {
                        return handleRequest(c, next, newSpan, startTime);
                    },
                );
            } else {
                return handleRequest(c, next, span, startTime);
            }
        });
    };
}

async function handleRequest(
    c: Context,
    next: () => Promise<void>,
    span: Span,
    startTime: number,
) {
    const method = c.req.method;
    const route = c.req.path;

    const requestLogger = logger.with({ route });
    c.set('logger', requestLogger);

    try {
        await next();

        const httpRoute = getRouteTemplate(span) ?? routePath(c) ?? route;

        span.updateName(`${method} ${httpRoute}`);
        span.setAttribute(ATTR_URL_PATH, route);
        span.setAttribute(ATTR_HTTP_ROUTE, httpRoute);

        span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, c.res.status);
        c.res.headers.append('x-trace-id', span.spanContext().traceId);

        const allowHeaders = c.res.headers.get('Access-Control-Allow-Headers');
        if (allowHeaders) {
            c.res.headers.set(
                'Access-Control-Allow-Headers',
                [
                    ...new Set([
                        ...allowHeaders.split(',').map((h) => h.trim()),
                        ...PROPAGATION_HEADERS,
                    ]),
                ].join(', '),
            );
        }

        if (c.error) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: c.error.message,
            });
            span.recordException(c.error);
        } else if (c.res.status >= 500) {
            span.setStatus({ code: SpanStatusCode.ERROR });
        }

        const durationS = (performance.now() - startTime) / 1000;
        const durationMs = Math.round(durationS * 1000);

        if (!isProduction) {
            if (c.res.status >= 500) {
                requestLogger.error(
                    '{method} {httpRoute} {status} {durationMs}ms',
                    {
                        method,
                        httpRoute,
                        status: c.res.status,
                        durationMs,
                    },
                );
            } else if (c.res.status >= 400) {
                requestLogger.warn(
                    '{method} {httpRoute} {status} {durationMs}ms',
                    {
                        method,
                        httpRoute,
                        status: c.res.status,
                        durationMs,
                    },
                );
            } else {
                requestLogger.info(
                    '{method} {httpRoute} {status} {durationMs}ms',
                    { method, httpRoute, status: c.res.status, durationMs },
                );
            }
        }
    } catch (err) {
        const httpRoute = getRouteTemplate(span) ?? routePath(c) ?? route;

        span.updateName(`${method} ${httpRoute}`);
        span.setAttribute(ATTR_URL_PATH, route);
        span.setAttribute(ATTR_HTTP_ROUTE, httpRoute);
        span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, 500);

        c.res.headers.append('x-trace-id', span.spanContext().traceId);
        const allowHeaders = c.res.headers.get('Access-Control-Allow-Headers');
        if (allowHeaders) {
            c.res.headers.set(
                'Access-Control-Allow-Headers',
                [
                    ...new Set([
                        ...allowHeaders.split(',').map((h) => h.trim()),
                        ...PROPAGATION_HEADERS,
                    ]),
                ].join(', '),
            );
        }

        span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (err as Error).message,
        });
        span.recordException(err as Error);

        const durationS = (performance.now() - startTime) / 1000;
        const durationMs = Math.round(durationS * 1000);

        if (!isProduction) {
            requestLogger.error(
                '{method} {httpRoute} {status} {durationMs}ms',
                {
                    method,
                    httpRoute,
                    status: 500,
                    durationMs,
                },
            );
        }
        throw err;
    }
}
