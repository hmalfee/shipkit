import { isIP } from 'node:net';

import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

import type { Redis } from '@shipkit/db/redis';
import type { Logger } from '@shipkit/telemetry/logger';

/**
 * Client IP headers, checked in order. Headers that CDNs/platforms always
 * overwrite come first; the generic proxy headers come last.
 */
const IP_HEADERS = [
    'cf-connecting-ip', // Cloudflare
    'fly-client-ip', // Fly.io
    'fastly-client-ip', // Fastly
    'true-client-ip', // Akamai / Cloudflare Enterprise
    'x-real-ip', // nginx, many proxies
    'x-forwarded-for', // Traefik, nginx, ALBs, most others
] as const;

export type IpHeader = (typeof IP_HEADERS)[number];

export interface RateLimitConfig {
    /** Max requests allowed in the 60s window (default: 10) */
    limit?: number;
    /** Seconds to block after limit is exceeded (default: 0 — no block) */
    blockDuration?: number;
    /** Key override, e.g. a user ID. Falls back to client IP. */
    identifier?: string;
}

export interface RateLimitResult {
    exceeded: boolean;
    limit: number;
    remaining: number;
    /** Milliseconds until the block expires */
    resetMs: number;
}

export interface RateLimitSystem {
    reqHeaders: Headers;
    resHeaders: Headers;
    redis: Redis;
    pathKey: string;
    logger: Logger;
    /** Only read this header instead of auto-detecting. Recommended in production. */
    ipHeader?: IpHeader;
}

/**
 * Rate limit tiers, ordered from most to least restrictive.
 * `limit` = max requests, `blockDuration` = seconds blocked once exceeded.
 *
 * Pick a tier based on how risky or expensive an endpoint is to abuse,
 * not on what the endpoint does.
 */
export const RATE_LIMIT_PRESETS = {
    // Expensive or high-impact, and legit users rarely repeat it
    // (e.g. sensitive account changes that trigger an email).
    STRICT: { limit: 5, blockDuration: 3600 }, // 1 hour
    // Abusable (spam, or guessing a short secret), but users may
    // legitimately retry a few times (typos, "didn't get the email").
    MODERATE: { limit: 5, blockDuration: 900 }, // 15 min
    // Authenticated and cheap, but still worth guarding against spam.
    STANDARD: { limit: 10, blockDuration: 60 }, // 1 min
    // Cheap and not guessable (long random tokens, protected redirects).
    // Only guards against floods; generous for shared IPs and link scanners.
    RELAXED: { limit: 20, blockDuration: 60 }, // 1 min
} as const;

const V4_MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;
let _ipWarnOnce = false;

const normalizeIP = (ip: string): string =>
    (V4_MAPPED.exec(ip)?.[1] ?? ip).toLowerCase();

const readIP = (headers: Headers, name: IpHeader): string | undefined => {
    const raw = headers.get(name);
    const candidate = (
        name === 'x-forwarded-for' ? raw?.split(',')[0] : raw
    )?.trim();
    // Reject garbage so arbitrary client strings never become Redis keys.
    return candidate && isIP(candidate) ? normalizeIP(candidate) : undefined;
};

const resolveIP = (
    headers: Headers,
    only: IpHeader | undefined,
    log: Logger,
): string => {
    const names = only ? [only] : IP_HEADERS;
    for (const name of names) {
        const ip = readIP(headers, name);
        if (ip) return ip;
    }

    if (!_ipWarnOnce) {
        _ipWarnOnce = true;
        log.warn(
            '[RateLimit] No valid client IP header found, using a shared per-route bucket. ' +
                `Check that your proxy sets one of: ${names.join(', ')}.`,
        );
    }
    return 'no-ip';
};

const limiterPool = new Map<string, RateLimiterRedis>();

const getLimiter = (
    points: number,
    duration: number,
    blockDuration: number,
    redis: Redis,
): RateLimiterRedis => {
    const k = `${points}:${duration}:${blockDuration}`;
    const existing = limiterPool.get(k);
    if (existing) return existing;

    const limiter = new RateLimiterRedis({
        storeClient: redis,
        keyPrefix: 'rl',
        points,
        duration,
        blockDuration,
        ...(blockDuration > 0 && {
            inMemoryBlockOnConsumed: points + 1,
            inMemoryBlockDuration: 60,
        }),
    });
    limiterPool.set(k, limiter);
    return limiter;
};

export const createRateLimit =
    (system: RateLimitSystem) =>
    async (config?: RateLimitConfig): Promise<RateLimitResult> => {
        const { limit = 10, blockDuration = 0, identifier } = config ?? {};
        const ip = resolveIP(system.reqHeaders, system.ipHeader, system.logger);
        const key = `${identifier ?? ip}|${system.pathKey}`;
        const limiter = getLimiter(limit, 60, blockDuration, system.redis);

        try {
            const res = await limiter.consume(key);
            return {
                exceeded: false,
                limit,
                remaining: res.remainingPoints,
                resetMs: res.msBeforeNext,
            };
        } catch (err) {
            // Only a RateLimiterRes means "limit exceeded". Anything else
            // (Error, string, ...) is an infrastructure failure: fail open.
            if (!(err instanceof RateLimiterRes)) {
                system.logger.error('[RateLimit] Redis error', { error: err });
                return { exceeded: false, limit, remaining: limit, resetMs: 0 };
            }
            system.resHeaders.set(
                'Retry-After',
                String(Math.ceil(err.msBeforeNext / 1000)),
            );
            return {
                exceeded: true,
                limit,
                remaining: err.remainingPoints,
                resetMs: err.msBeforeNext,
            };
        }
    };
