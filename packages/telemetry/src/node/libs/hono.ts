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

type RequestLogger = ReturnType<typeof logger.with>;

/**
 * Hono middleware that adds OpenTelemetry tracing and logging to requests.
 * Extracts propagation context from headers, manages the active span for the request lifecycle,
 * and logs request details (method, route, status, duration) in non-production environments only.
 * It does not log raw error objects.
 * It also attaches the `x-trace-id` header to responses and handles CORS allowed headers for propagation.
 */
export function traceHonoRequest(): MiddlewareHandler {
    return async (c, next) => {
        // Ignore OPTIONS requests for telemetry but allow CORS headers on them
        if (c.req.method === 'OPTIONS') {
            await next();
            mergePropagationHeaders(c);
            return;
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
                    (newSpan) => handleRequest(c, next, newSpan, startTime),
                );
            }

            return handleRequest(c, next, span, startTime);
        });
    };
}

/**
 * Runs the downstream handler chain, then finalizes the span and logs the
 * outcome exactly once — whether `next()` resolves or throws — via `finally`.
 */
async function handleRequest(
    c: Context,
    next: () => Promise<void>,
    span: Span,
    startTime: number,
): Promise<void> {
    const method = c.req.method;
    const route = c.req.path;
    const requestLogger = logger.with({ route });

    let thrownError: Error | undefined;

    try {
        await next();
    } catch (err) {
        thrownError = err as Error;
        throw err;
    } finally {
        const { httpRoute, status } = finalizeSpan(
            c,
            span,
            method,
            route,
            thrownError,
        );

        if (!isProduction) {
            const durationMs = Math.round(performance.now() - startTime);
            logRequestOutcome(
                requestLogger,
                method,
                httpRoute,
                status,
                durationMs,
            );
        }
    }
}

/**
 * Sets the final span name/attributes/status and appends response headers.
 * `thrownError` is only present when `next()` threw past this middleware —
 * distinct from an error already handled internally and surfaced via `c.error`.
 */
function finalizeSpan(
    c: Context,
    span: Span,
    method: string,
    route: string,
    thrownError?: Error,
): { httpRoute: string; status: number } {
    const httpRoute = getRouteTemplate(span) ?? routePath(c) ?? route;
    const status = thrownError ? 500 : c.res.status;

    span.updateName(`${method} ${httpRoute}`);
    span.setAttribute(ATTR_URL_PATH, route);
    span.setAttribute(ATTR_HTTP_ROUTE, httpRoute);
    span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, status);

    c.res.headers.append('x-trace-id', span.spanContext().traceId);
    mergePropagationHeaders(c);

    const error = thrownError ?? c.error;
    if (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
    } else if (status >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR });
    }

    return { httpRoute, status };
}

/** Merges the propagation headers into any existing CORS allow-list. */
function mergePropagationHeaders(c: Context): void {
    const allowHeaders = c.res.headers.get('Access-Control-Allow-Headers');
    if (!allowHeaders) return;

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

function logRequestOutcome(
    requestLogger: RequestLogger,
    method: string,
    httpRoute: string,
    status: number,
    durationMs: number,
): void {
    const template = '{method} {httpRoute} {status} {durationMs}ms';
    const fields = { method, httpRoute, status, durationMs };

    if (status >= 500) {
        requestLogger.error(template, fields);
    } else {
        requestLogger.info(template, fields);
    }
}
