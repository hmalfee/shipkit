import { implement } from '@orpc/server';
import { RateLimiterRedis } from 'rate-limiter-flexible';

import { contract } from '@mento-mark/shared/orpc';
import { type logger } from '@mento-mark/telemetry/logger';

import { env } from '@/env';

import type { Auth } from '@mento-mark/auth';
import type { Database } from '@mento-mark/db/pg';
import type { Redis } from '@mento-mark/db/redis';
import type { RateLimiterRes } from 'rate-limiter-flexible';

export type RateLimitConfig = {
    limit?: number; // e.g., 100
    window?: number; // e.g., 10 (seconds)
    identifier?: string; // Optional override for the extracted IP
};

export interface RateLimitResult {
    exceeded: boolean;
    limit: number;
    remaining: number;
    reset: number;
}

export type Context = {
    reqHeaders: Headers;
    resHeaders: Headers;
    auth: Auth;
    db: Database;
    redis: Redis;
    logger: typeof logger;
};

// Cache for rate limiters to avoid creating a new instance for every request
const rateLimiters = new Map<string, RateLimiterRedis>();

const getRateLimiter = (
    points: number,
    duration: number,
    redisClient: Redis,
) => {
    const key = `${points}:${duration}`;
    let limiter = rateLimiters.get(key);

    if (!limiter) {
        limiter = new RateLimiterRedis({
            storeClient: redisClient,
            points,
            duration,
            keyPrefix: 'rate_limit',
        });
        rateLimiters.set(key, limiter);
    }

    return limiter;
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

const routeBuilder = os.use(
    base.concat(
        os.middleware(async ({ context, next, path }) => {
            const session = await context.auth.getSession();
            const routeId = path.join('.');

            const rateLimit = async (
                config?: RateLimitConfig,
            ): Promise<RateLimitResult> => {
                const ip =
                    context.reqHeaders.get('x-forwarded-for') ?? 'anonymous';
                const baseIdentifier = config?.identifier ?? ip;
                const identifier = `${routeId}:${baseIdentifier}`;

                // Use provided config or a default of 100 requests per minute
                const limit = config?.limit ?? 100;
                const window = config?.window ?? 60;

                const limiter = getRateLimiter(limit, window, context.redis);

                try {
                    const result = await limiter.consume(identifier, 1);
                    return {
                        exceeded: false,
                        limit,
                        remaining: result.remainingPoints,
                        reset: result.msBeforeNext,
                    };
                } catch (rejection: unknown) {
                    // rate-limiter-flexible rejects with RateLimiterRes when exceeded
                    const result = rejection as RateLimiterRes;
                    return {
                        exceeded: true,
                        limit,
                        remaining: result?.remainingPoints ?? 0,
                        reset: result?.msBeforeNext ?? 0,
                    };
                }
            };

            return next({
                context: { ...context, session, rateLimit },
            });
        }),
    ),
);

/**
 * `cr` (createRoute): Route builder with timing + session + rateLimit.
 * Auth enforcement is handled in route handlers via contract-defined errors.
 */
export const cr = routeBuilder;
