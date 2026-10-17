import {
    createDefineRouter,
    createImplementer,
} from '@shipkit/orpc-utils/server';
import {
    routeLogging,
    simulateLatency,
} from '@shipkit/orpc-utils/server/middlewares';
import { createRateLimiter } from '@shipkit/orpc-utils/server/rate-limit';
import { contract } from '@shipkit/shared/orpc-contract';
import { captureORPCTemplate } from '@shipkit/telemetry/node/orpc';

import { env } from '@/env';

import type { Auth } from '@shipkit/auth';
import type { Database } from '@shipkit/db/pg';
import type { Redis } from '@shipkit/db/redis';
import type { Logger } from '@shipkit/telemetry/logger';

type Context = {
    reqHeaders: Headers;
    resHeaders: Headers;
    /** TCP peer address. Used for proxy headers only if the peer is in TRUSTED_PROXIES. */
    socketIp?: string | undefined;
    auth: Auth;
    db: Database;
    redis: Redis;
    logger: Logger;
};

/** The contract bound to this app's context. Used to assemble the root router. */
export const implementer = createImplementer<Context>()(contract);

const rateLimitFor = createRateLimiter({
    header: env.CLIENT_IP_HEADER,
    trustedProxies: env.TRUSTED_PROXIES,
});

/** Resolves the session and exposes `context.rateLimit` to every handler. */
const sessionMiddleware = implementer.middleware(
    async ({ context, next, path }) => {
        const session = await context.auth.getSession();
        const rateLimit = rateLimitFor({
            reqHeaders: context.reqHeaders,
            resHeaders: context.resHeaders,
            redis: context.redis,
            logger: context.logger,
            pathKey: path.join('.'),
            userId: session?.user.id,
            socketIp: context.socketIp,
        });
        return next({ context: { ...context, session, rateLimit } });
    },
);

/** Every procedure in the contract, with tracing, logging, latency, session and rate limit applied. */
const procedures = implementer
    .use(captureORPCTemplate)
    .use(routeLogging({ logSuccess: env.NODE_ENV === 'development' }))
    .use(simulateLatency({ enabled: env.NODE_ENV === 'development' }))
    .use(sessionMiddleware);

/**
 * `defineRouter.auth({ ... })` defines the router for one top-level contract
 * group. Handlers mirror the contract's structure and run through the
 * middleware chain above. Return values are checked exactly against the
 * contract.
 */
export const defineRouter = createDefineRouter(contract, procedures);
