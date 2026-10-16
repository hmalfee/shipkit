import { createHash } from 'node:crypto';

import { ORPCError } from '@orpc/server';

import { normalizeEmail, sanitizeEmail } from '@shipkit/auth/email-validation';

import type { Redis } from '@shipkit/db/redis';
import type { Logger } from '@shipkit/telemetry/logger';
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

/**
 * Call once at startup. Validates the IP config (throws on bad input, so a
 * broken proxy setup fails the deploy) and returns a per-request factory.
 */
export const createRateLimiter = (
    config: {
        /** Defaults to 'socket' (the TCP peer). Or a header name a trusted proxy sets. Case-insensitive. */
        header?: string | undefined;
        /** IPs or CIDRs, e.g. ['173.245.48.0/20', '2400:cb00::/32']. */
        trustedProxies?: readonly string[];
    } = {},
) => {
    const clientIp = createClientIpConfig(config);

    return (ctx: {
        reqHeaders: Headers;
        resHeaders: Headers;
        redis: Redis;
        logger: Logger;
        /** Static procedure path, e.g. "auth.login". Never IDs or user input. */
        pathKey: string;
        /** Signed-in user, if any. Adds a per-user bucket to every call. */
        userId?: string | null;
        /** TCP peer address of this request. */
        socketIp?: string;
    }) => {
        // Sanitized so the path can't inject characters into Redis keys.
        const path = ctx.pathKey.replace(/[^\w.:/-]/g, '_').slice(0, 128);
        return async ({
            tier,
            by = {},
            escalate = false,
            global,
            error,
        }: {
            tier: keyof typeof RATE_LIMIT_PRESETS;
            /** Who is acting: one bucket per non-empty value. */
            by?: Record<string, string | null | undefined>;
            /** Repeat offenders get exponentially longer blocks. */
            escalate?: boolean;
            /**
             * Ceiling shared by every client of this route. Counts only requests
             * that pass the IP and subject checks. Blocks everyone while tripped.
             */
            global?: Omit<Dim, 'name' | 'key'>;
            /** Thrown instead of the default 429 when the limit is hit. */
            error?: Error;
        }) => {
            const preset = RATE_LIMIT_PRESETS[tier];
            const bucket = resolveIpBucket({
                headers: ctx.reqHeaders,
                config: clientIp,
                socketIp: ctx.socketIp,
                logger: ctx.logger,
            });

            // IP-level gates, checked in this order. Burst goes first so a
            // burst rejection never counts toward the longer IP block.
            const gates: Dim[] = (['burst', 'ip'] as const).map((name) => ({
                name,
                key: `${name}:${bucket ?? 'unknown'}|${path}`,
                ...preset[name],
                // No IP: every unidentifiable client shares one bucket, so it gets 20x the limit.
                limit: bucket ? preset[name].limit : preset[name].limit * 20,
            }));

            const subjects: Dim[] = [];
            // Signed-in user last, so a caller can't replace it through `by`.
            const entries = Object.entries({
                ...by,
                ...(ctx.userId ? { user: ctx.userId } : {}),
            });
            for (const [name, raw] of entries) {
                const value =
                    name === 'email' && raw
                        ? normalizeEmail(sanitizeEmail(raw))
                        : raw;
                if (!value) continue;
                // Hashed: no PII in Redis, bounded key length, and a value
                // containing "|" or ":" can't forge another key.
                const hash = createHash('sha256')
                    .update(value.normalize('NFKC').trim().toLowerCase())
                    .digest('base64url')
                    .slice(0, 22);
                subjects.push({
                    name,
                    key: `${name}:${hash}|${path}`,
                    ...preset.subject,
                });
            }

            const globalDim: Dim | undefined = global && {
                name: 'global',
                key: `global|${path}`,
                ...global,
            };

            let blockedBy: string | undefined;
            try {
                blockedBy = await enforce({
                    redis: ctx.redis,
                    logger: ctx.logger,
                    resHeaders: ctx.resHeaders,
                    escalate,
                    gates,
                    subjects,
                    global: globalDim,
                });
            } catch (err) {
                // Redis and the in-memory fallback both failed: fail open, loudly.
                ctx.logger.error('[RateLimit] Unexpected error', {
                    error: err,
                });
                return;
            }

            if (blockedBy) {
                throw (
                    error ??
                    new ORPCError('TOO_MANY_REQUESTS', {
                        message: 'Too many attempts',
                    })
                );
            }
        };
    };
};
