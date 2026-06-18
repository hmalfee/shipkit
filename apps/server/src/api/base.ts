import { implement } from '@orpc/server';

import { contract } from '@mento-mark/shared/orpc';
import { type logger } from '@mento-mark/telemetry/logger';

import { env } from '@/env';

import type { Auth } from '@mento-mark/auth';
import type { Database } from '@mento-mark/db/pg';
import type { Redis } from '@mento-mark/db/redis';

import { createRateLimit } from './rate-limiter';

export type Context = {
    reqHeaders: Headers;
    resHeaders: Headers;
    auth: Auth;
    db: Database;
    redis: Redis;
    logger: typeof logger;
};

/**
 * `os` (oRPC server): Contract-bound base for building routes
 * and assembling the router. This is a shorthand for the server
 * implementation bound to the application's oRPC `contract`.
 */
export const os = implement(contract).$context<Context>();

/**
 * Base route wrapper: timing and logging for all routes
 */
const base = os.middleware(async ({ context, next, path }) => {
    const start = Date.now();
    try {
        const result = await next();
        const end = Date.now();
        if (env.NODE_ENV === 'development') {
            context.logger.info(
                `[oRPC] ${path.join('.')} executed in ${end - start}ms`,
            );
        }
        return result;
    } catch (error) {
        const end = Date.now();
        context.logger.error(
            `[oRPC] ${path.join('.')} failed in ${end - start}ms`,
        );
        // rethrow error to be handled by global error handler
        // oxlint-disable-next-line eslint-js/no-restricted-syntax
        throw error;
    }
});

/**
 * `cr` (createRoute): Route builder with `base` + session + rateLimit.
 * Auth enforcement is handled in route handlers via contract-defined errors.
 */
export const cr = os.use(
    base.concat(
        os.middleware(async ({ context, next, path }) => {
            // One trade-off is that by the time the rate limit is checked
            // in routes, the session has already been fetched. However, since
            // we mostly rate limit users on routes where getSession won't
            // reach the database (e.g. login/signup routes) due to invalid
            // session cookies, this is an acceptable trade-off.
            const session = await context.auth.getSession();

            const rateLimit = createRateLimit({
                reqHeaders: context.reqHeaders,
                resHeaders: context.resHeaders,
                redis: context.redis,
                pathKey: path.join('.'),
                logger: context.logger,
            });

            return next({
                context: { ...context, session, rateLimit },
            });
        }),
    ),
);
