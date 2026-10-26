import { createHash } from 'node:crypto';

import { ORPCError } from '@orpc/server';

import { normalizeEmail, sanitizeEmail } from '@shipkit/auth/email-validation';

import type { Redis } from '@shipkit/db/redis';
import type { Logger } from '@shipkit/telemetry/logger';
import type { ErrorFactory } from '../guards';
import type { ClientIpOptions } from './identity';
import type { Dim } from './limiter';

import { createClientIpConfig, resolveIpBucket } from './identity';
import { enforce } from './limiter';

/**
 * Tiers, most to least restrictive. Rules apply to:
 *  - `burst`:   the client IP over a short window, to stop rapid-fire loops
 *  - `ip`:      the client IP over a minute, then a block
 *  - `subject`: each `by` value (target email, signed-in user)
 * `window` defaults to 60 s and a missing `blockDuration` means no block.
 * Tune the whole API here.
 */
export const RATE_LIMIT_PRESETS = {
    // Expensive or high-impact; legit users rarely repeat it.
    STRICT: {
        burst: { limit: 2, window: 10 },
        ip: { limit: 5, window: 60, blockDuration: 3600 },
        subject: { limit: 3, window: 3600, blockDuration: 3600 },
    },
    // Abusable, but users may retry a few times (typos, lost emails).
    MODERATE: {
        burst: { limit: 3, window: 10 },
        ip: { limit: 5, window: 60, blockDuration: 900 },
        subject: { limit: 5, window: 900, blockDuration: 900 },
    },
    // Authenticated and cheap, but still worth guarding against spam.
    STANDARD: {
        burst: { limit: 5, window: 10 },
        ip: { limit: 10, window: 60, blockDuration: 60 },
        subject: { limit: 30, window: 60, blockDuration: 60 },
    },
    // Cheap and not guessable. Flood guard only, generous for shared IPs.
    RELAXED: {
        burst: { limit: 10, window: 10 },
        ip: { limit: 20, window: 60, blockDuration: 60 },
        subject: { limit: 60, window: 60, blockDuration: 60 },
    },
} as const;

/** Every unidentifiable client shares one IP bucket, so it gets this multiple of the limit. */
const UNKNOWN_IP_LIMIT_FACTOR = 20;
const TOO_MANY_MESSAGE = 'Too many attempts';

type Subjects = Record<string, string | null | undefined>;

/** Everything the limiter needs for one request. Supplied by the app. */
type RateLimitDeps = {
    reqHeaders: Headers;
    resHeaders: Headers;
    redis: Redis;
    logger: Logger;
    /** TCP peer address of this request. */
    socketIp?: string | undefined;
    /** Signed-in user, if any. Adds a per-user bucket to every call. */
    userId?: string | null | undefined;
};

type RateLimitOptions = {
    tier: keyof typeof RATE_LIMIT_PRESETS;
    /** Who is acting: one bucket per non-empty value. */
    by?: Subjects;
    /** Repeat offenders get exponentially longer blocks. */
    escalate?: boolean;
    /**
     * Ceiling shared by every client of this route. Counts only requests
     * that pass the IP and subject checks. Blocks everyone while tripped.
     */
    global?: Omit<Dim, 'name' | 'key'>;
    /** Thrown instead of the default 429. A thunk, so it's only built when needed. */
    error?: () => Error;
};

/** Sanitized so the path can't inject characters into Redis keys. */
const sanitizePath = (path: readonly string[]): string =>
    path
        .join('.')
        .replace(/[^\w.:/-]/g, '_')
        .slice(0, 128);

/**
 * Hashed: no PII in Redis, bounded key length, and a value containing "|" or
 * ":" can't forge another key.
 */
const hashValue = (value: string): string =>
    createHash('sha256')
        .update(value.normalize('NFKC').trim().toLowerCase())
        .digest('base64url')
        .slice(0, 22);

/**
 * Low-level limiter. Call once at startup: validates the IP config (throws on
 * bad input, so a broken proxy setup fails the deploy). Takes explicit deps,
 * so it has no opinion about how the app shapes its context.
 */
const createRateLimiter = (options: ClientIpOptions = {}) => {
    const clientIp = createClientIpConfig(options);
    return async (
        deps: RateLimitDeps & {
            /** Procedure path, e.g. ['auth', 'email', 'signIn']. Never IDs or user input. */
            path: readonly string[];
        },
        { tier, by = {}, escalate = false, global, error }: RateLimitOptions,
    ): Promise<void> => {
        const { reqHeaders, resHeaders, redis, logger, socketIp, userId } =
            deps;
        const path = sanitizePath(deps.path);
        const preset = RATE_LIMIT_PRESETS[tier];
        const bucket = resolveIpBucket({
            headers: reqHeaders,
            config: clientIp,
            socketIp,
            logger,
        });

        // IP-level gates, checked in this order. Burst goes first so a
        // burst rejection never counts toward the longer IP block.
        const gates = (['burst', 'ip'] as const).map((name): Dim => ({
            name,
            key: `${name}:${bucket ?? 'unknown'}|${path}`,
            ...preset[name],
            limit: bucket
                ? preset[name].limit
                : preset[name].limit * UNKNOWN_IP_LIMIT_FACTOR,
        }));

        // Signed-in user last, so a caller can't replace it through `by`.
        const subjects = Object.entries({
            ...by,
            ...(userId && { user: userId }),
        }).flatMap(([name, raw]): Dim[] => {
            const value =
                name === 'email' && raw
                    ? normalizeEmail(sanitizeEmail(raw))
                    : raw;
            return value
                ? [
                      {
                          name,
                          key: `${name}:${hashValue(value)}|${path}`,
                          ...preset.subject,
                      },
                  ]
                : [];
        });

        let blockedBy: string | undefined;
        try {
            blockedBy = await enforce({
                redis,
                logger,
                resHeaders,
                escalate,
                gates,
                subjects,
                global: global && {
                    name: 'global',
                    key: `global|${path}`,
                    ...global,
                },
            });
        } catch (err) {
            // Redis and the in-memory fallback both failed: fail open, loudly.
            logger.error('[RateLimit] Unexpected error', { error: err });
            return;
        }
        if (blockedBy) {
            throw (
                error?.() ??
                new ORPCError('TOO_MANY_REQUESTS', {
                    message: TOO_MANY_MESSAGE,
                })
            );
        }
    };
};

type LimitConfig<TInput> = Omit<RateLimitOptions, 'by' | 'error'> & {
    by?: (input: TInput) => Subjects;
};

/**
 * Builds a rate-limit wrapper for handlers, the same way `createContextGuard` builds
 * `authed`. Nothing is injected into the context: `resolve` maps whatever
 * context the app has to what the limiter needs, and a missing or mistyped
 * field is a compile error right there.
 *
 * Two calls because TypeScript can't partially infer type arguments: the first
 * fixes the context type, the second takes the runtime config.
 *
 * @example
 * export const rateLimited = createRateLimit<HandlerContext>()({
 *     header: env.CLIENT_IP_HEADER,
 *     trustedProxies: env.TRUSTED_PROXIES,
 *     resolve: (ctx) => ({ reqHeaders: ctx.reqHeaders, ... }),
 * });
 */
export const createRateLimit =
    <TContext extends object>() =>
    ({
        resolve,
        ...ipOptions
    }: ClientIpOptions & {
        /** Maps the handler context to what the limiter needs. */
        resolve: (context: TContext) => RateLimitDeps;
    }) => {
        const limit = createRateLimiter(ipOptions);
        return <
                O extends {
                    input: unknown;
                    path: readonly string[];
                    context: TContext;
                    errors: { TOO_MANY_REQUESTS: ErrorFactory };
                },
                R,
            >(
                { by, ...rest }: LimitConfig<O['input']>,
                fn: (o: O) => R | Promise<R>,
            ) =>
            async (o: O): Promise<R> => {
                await limit(
                    { ...resolve(o.context), path: o.path },
                    {
                        ...rest,
                        ...(by && { by: by(o.input) }),
                        error: () =>
                            o.errors.TOO_MANY_REQUESTS({
                                message: TOO_MANY_MESSAGE,
                            }),
                    },
                );
                return fn(o);
            };
    };
