import { RateLimiterRedis } from 'rate-limiter-flexible';

import type { Redis } from '@shipkit/db/redis';
import type { Logger } from '@shipkit/telemetry/logger';
import type { RateLimiterRes } from 'rate-limiter-flexible';

interface RateLimitConfig {
    /** Max requests allowed in the 60s window (default: 10) */
    limit?: number;
    /** Seconds to block after limit is exceeded (default: 0 — no block) */
    blockDuration?: number;
    /** Key override, e.g. a user ID. Falls back to client IP. */
    identifier?: string;
}

interface RateLimitResult {
    exceeded: boolean;
    limit: number;
    remaining: number;
    /** Milliseconds until the block expires */
    resetMs: number;
}

interface RateLimitSystem {
    reqHeaders: Headers;
    resHeaders: Headers;
    redis: Redis;
    pathKey: string;
    logger: Logger;
}

const V4_MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;
let _ipWarnOnce = false;

const stripV4Mapped = (ip: string): string => {
    const match = V4_MAPPED.exec(ip);
    return (match?.[1] ?? ip).toLowerCase();
};

const resolveIP = (headers: Headers, log: Logger): string => {
    // 1. Cloudflare — most trustworthy when behind CF
    const cfIp = headers.get('cf-connecting-ip')?.trim();
    if (cfIp) return stripV4Mapped(cfIp);

    // 2. Standard reverse proxy header (Traefik, nginx, etc.)
    const xffIp = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (xffIp) return stripV4Mapped(xffIp);

    // 3. Some proxies use this
    const realIp = headers.get('x-real-ip')?.trim();
    if (realIp) return stripV4Mapped(realIp);

    // 4. Nothing available: return 'no-ip' and log a warning
    if (!_ipWarnOnce) {
        _ipWarnOnce = true;
        log.warn(
            '[RateLimit] No IP found in headers or fallback — using shared per-route bucket. ' +
                'Ensure your proxy sets x-forwarded-for or x-real-ip.',
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
    if (limiterPool.has(k)) return limiterPool.get(k)!;

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

        const ip = resolveIP(system.reqHeaders, system.logger);
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
            if (err instanceof Error) {
                // Fail open on infrastructure errors — don't block legitimate users
                system.logger.error('[RateLimit] Redis error', { error: err });
                return { exceeded: false, limit, remaining: limit, resetMs: 0 };
            }

            const rlRes = err as RateLimiterRes;
            const resetMs = rlRes?.msBeforeNext ?? 0;

            system.resHeaders.set(
                'Retry-After',
                String(Math.ceil(resetMs / 1000)),
            );

            return {
                exceeded: true,
                limit,
                remaining: rlRes?.remainingPoints ?? 0,
                resetMs,
            };
        }
    };
