import {
    createImplementer,
    defineRouteBuilder,
} from '@shipkit/orpc-utils/server';
import {
    routeLogging,
    simulateLatency,
} from '@shipkit/orpc-utils/server/middlewares';
import { createRateLimit } from '@shipkit/orpc-utils/server/rate-limit';
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
    auth: Auth;
    db: Database;
    redis: Redis;
    logger: Logger;
};

/** Contract-bound base for assembling routers. */
export const os = createImplementer<Context>()(contract);

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
                return next({ context: { ...context, session, rateLimit } });
            }),
        ),
);
