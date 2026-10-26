import {
    createContextGuard,
    createDefineRouter,
    createImplementer,
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
import type { ContextFromProcedures } from '@shipkit/orpc-utils/server';
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

/** Every procedure in the contract, with tracing, logging, latency and session applied. */
const procedures = implementer
    .use(captureORPCTemplate)
    .use(
        routeLogging({
            logSuccess: env.NODE_ENV === 'development',
            logger: (ctx) => ctx.logger,
        }),
    )
    .use(simulateLatency({ enabled: env.NODE_ENV === 'development' }))
    .use(async ({ context, next }) => {
        const session = await context.auth.getSession();
        return next({ context: { session } });
    });

export const defineRouter = createDefineRouter(contract, procedures);

/** What every handler receives once the middleware chain from procedures has run. */
export type HandlerContext = ContextFromProcedures<typeof procedures>;

export const authed = createContextGuard<HandlerContext>()({
    key: 'session',
    error: 'UNAUTHORIZED',
    message: 'You must be logged in',
});

/** @public */
export const requireAdmin = createContextGuard<HandlerContext>()({
    key: 'session',
    check: ({ session }) => session.user.roles.includes('admin'),
    error: 'FORBIDDEN',
    message: 'Admin access required',
});

export const guest = createContextGuard<HandlerContext>()({
    key: 'session',
    error: 'FORBIDDEN',
    message: 'You must be logged out',
    negate: true,
});

export const rateLimited = createRateLimit<HandlerContext>()({
    header: env.CLIENT_IP_HEADER,
    trustedProxies: env.TRUSTED_PROXIES,
    resolve: (ctx) => ({
        reqHeaders: ctx.reqHeaders,
        resHeaders: ctx.resHeaders,
        redis: ctx.redis,
        logger: ctx.logger,
        socketIp: ctx.socketIp,
        userId: ctx.session?.user.id,
    }),
});
