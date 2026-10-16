import {
    RateLimiterMemory,
    RateLimiterRedis,
    RateLimiterRes,
} from 'rate-limiter-flexible';

import type { Redis } from '@shipkit/db/redis';
import type { Logger } from '@shipkit/telemetry/logger';

export interface Dim {
    name: string;
    key: string;
    limit: number;
    /** Counting period in seconds. Defaults to 60. */
    window?: number;
    /** Seconds to block once the limit is exceeded. Defaults to 0 (no block). */
    blockDuration?: number;
}

interface Outcome {
    name: string;
    exceeded: boolean;
    limit: number;
    remaining: number;
    resetMs: number;
}

const DAY = 24 * 3600;
const pools = new WeakMap<Redis, Map<string, RateLimiterRedis>>();

/**
 * One limiter per Redis client and rule. The id encodes the rule, so different
 * rules never share counters. Each has an in-memory fallback if Redis is down.
 */
const limiterFor = (
    redis: Redis,
    name: string,
    points: number,
    duration: number,
    blockDuration = 0,
): RateLimiterRedis => {
    const id = `${name}:${points}:${duration}:${blockDuration}`;
    const pool = pools.get(redis) ?? new Map<string, RateLimiterRedis>();
    pools.set(redis, pool);

    let limiter = pool.get(id);
    if (!limiter) {
        limiter = new RateLimiterRedis({
            storeClient: redis,
            keyPrefix: `rl:${id}`,
            points,
            duration,
            blockDuration,
            insuranceLimiter: new RateLimiterMemory({
                points,
                duration,
                blockDuration,
            }),
            ...(blockDuration > 0 && {
                inMemoryBlockOnConsumed: points + 1,
                inMemoryBlockDuration: Math.min(60, blockDuration),
            }),
        });
        pool.set(id, limiter);
    }
    return limiter;
};

/**
 * Escalation: one strike per block period, not per blocked request. The lock
 * admits a single consume per period. From the 2nd strike the ban grows 4x per
 * strike, capped at 24 h. Returns the new ban in ms, if it was extended.
 */
const extendBan = async (
    redis: Redis,
    limiter: RateLimiterRedis,
    key: string,
    window: number,
    block: number,
): Promise<number | undefined> => {
    const newStrike = await limiterFor(
        redis,
        'lock',
        1,
        Math.max(block, window),
    )
        .consume(key)
        .then(
            () => true,
            (err: unknown) => {
                if (err instanceof RateLimiterRes) return false;
                throw err;
            },
        );
    if (!newStrike) return undefined;

    const { consumedPoints: strikes } = await limiterFor(
        redis,
        'strikes',
        1000,
        DAY,
    ).consume(key);
    if (strikes < 2) return undefined;

    const ban = Math.min(DAY, block * 4 ** (strikes - 1));
    await limiter.block(key, ban);
    return ban * 1000;
};

const consume = async (
    redis: Redis,
    logger: Logger,
    dim: Dim,
    escalate: boolean,
): Promise<Outcome> => {
    const { limit, window = 60, blockDuration = 0 } = dim;
    const limiter = limiterFor(redis, 'main', limit, window, blockDuration);
    try {
        const res = await limiter.consume(dim.key);
        return {
            name: dim.name,
            exceeded: false,
            limit,
            remaining: res.remainingPoints,
            resetMs: res.msBeforeNext,
        };
    } catch (err) {
        if (!(err instanceof RateLimiterRes)) throw err;

        let resetMs = err.msBeforeNext;
        if (escalate && blockDuration > 0) {
            try {
                resetMs =
                    (await extendBan(
                        redis,
                        limiter,
                        dim.key,
                        window,
                        blockDuration,
                    )) ?? resetMs;
            } catch (escErr) {
                logger.error('[RateLimit] Escalation failed', {
                    error: escErr,
                });
            }
        }
        return { name: dim.name, exceeded: true, limit, remaining: 0, resetMs };
    }
};

/**
 * Consumes every dimension and sets the RateLimit-* and Retry-After headers,
 * plus Access-Control-Expose-Headers so browsers on another origin can read
 * them without the CORS middleware having to list them.
 * Order matters:
 *  1. Gates (burst, then IP) run one at a time and stop at the first block.
 *     A blocked IP never touches subject buckets, so an attacker can't drain
 *     a victim's per-account quota, and a burst rejection never counts
 *     toward the longer IP block.
 *  2. Subject buckets run in parallel.
 *  3. The global ceiling counts only requests that cleared steps 1 and 2,
 *     so it measures real sends rather than blocked attempts.
 * Returns the name of the blocking dimension, if any.
 */
export const enforce = async ({
    redis,
    logger,
    resHeaders,
    escalate,
    gates,
    subjects,
    global,
}: {
    redis: Redis;
    logger: Logger;
    resHeaders: Headers;
    escalate: boolean;
    gates: Dim[];
    subjects: Dim[];
    global?: Dim;
}): Promise<string | undefined> => {
    const outcomes: Outcome[] = [];

    for (const gate of gates) {
        const outcome = await consume(redis, logger, gate, escalate);
        outcomes.push(outcome);
        if (outcome.exceeded) break;
    }

    if (!outcomes.some((o) => o.exceeded)) {
        const perSubject = await Promise.all(
            subjects.map((d) => consume(redis, logger, d, escalate)),
        );
        outcomes.push(...perSubject);
        if (global && !perSubject.some((o) => o.exceeded)) {
            outcomes.push(await consume(redis, logger, global, escalate));
        }
    }

    const tripped = outcomes.filter((o) => o.exceeded);
    // Report the dimension the client can least afford to ignore: the longest
    // block if any tripped, otherwise the one closest to its limit. A passing
    // burst bucket is left out so headers describe the minute-level quota,
    // not the 10 s one. The IP gate always runs, so this list is never empty.
    const worst = tripped.length
        ? tripped.reduce((a, b) => (b.resetMs > a.resetMs ? b : a))
        : outcomes
              .filter((o) => o.name !== 'burst')
              .reduce((a, b) => (b.remaining < a.remaining ? b : a));

    const resetSec = Math.ceil(worst.resetMs / 1000);

    const headers: Record<string, string> = {
        'RateLimit-Limit': String(worst.limit),
        'RateLimit-Remaining': String(Math.max(0, worst.remaining)),
        'RateLimit-Reset': String(resetSec),
        ...(tripped.length && { 'Retry-After': String(resetSec) }),
    };

    for (const [name, value] of Object.entries(headers)) {
        resHeaders.set(name, value);
    }

    resHeaders.append(
        'Access-Control-Expose-Headers',
        Object.keys(headers).join(', '),
    );

    return tripped.length ? worst.name : undefined;
};
