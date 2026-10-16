import {
    createImplementer,
    defineRouteBuilder,
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

/** Contract-bound base for assembling routers. */
export const os = createImplementer<Context>()(contract);

const createRateLimit = createRateLimiter({
    header: env.CLIENT_IP_HEADER,
    trustedProxies: env.TRUSTED_PROXIES,
});

/**
 * `cr` (createRoute): tracing, logging, latency simulation, session and
 * rate limit. Handler return values are checked exactly against the contract.
 */
export const cr = defineRouteBuilder(
    os
        .use(captureORPCTemplate)
        .use(routeLogging({ logSuccess: env.NODE_ENV === 'development' }))
        .use(simulateLatency({ enabled: env.NODE_ENV === 'development' }))
        .use(
            os.middleware(async ({ context, next, path }) => {
                const session = await context.auth.getSession();
                const rateLimit = createRateLimit({
                    reqHeaders: context.reqHeaders,
                    resHeaders: context.resHeaders,
                    redis: context.redis,
                    logger: context.logger,
                    pathKey: path.join('.'),
                    userId: session?.user.id,
                    socketIp: context.socketIp,
                });
                return next({
                    context: { ...context, session, rateLimit },
                });
            }),
        ),
);
