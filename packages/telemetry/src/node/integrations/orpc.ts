import type { AnyProcedure, Context, Middleware } from '@orpc/server';

import { getActiveSpan, setRouteTemplate } from '../spans';

/**
 * oRPC server middleware that extracts the HTTP route template
 * from the matched procedure's contract and stores it on the
 * active OpenTelemetry span.
 *
 * Usage: `os.use(captureORPCTemplate)` in the middleware chain.
 */
export const captureORPCTemplate: Middleware<
    Context,
    Record<never, never>,
    unknown,
    unknown,
    Record<never, never>,
    Record<string, unknown>
> = async ({ next, procedure }) => {
    const routePath = (procedure as AnyProcedure | undefined)?.['~orpc']?.route
        ?.path;

    if (typeof routePath === 'string') {
        const span = getActiveSpan();
        if (span) {
            setRouteTemplate(span, routePath);
        }
    }

    return next();
};
