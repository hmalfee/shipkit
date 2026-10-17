import { getConnInfo } from '@hono/node-server/conninfo';

import { createAuth } from '@shipkit/auth';
import { createDb } from '@shipkit/db/pg';
import { createRedisClient } from '@shipkit/db/redis';
import { createFetchHandler } from '@shipkit/orpc-utils/server';
import { logger } from '@shipkit/telemetry/logger';

import { env } from '@/env';

import type { MiddlewareHandler } from 'hono';

import { authConfig } from './auth.config';
import { appRouter } from './router';

const db = createDb(env.POSTGRES_URL, {
    debug: env.NODE_ENV === 'development',
});
const redis = createRedisClient(env.REDIS_URL, {
    debug: env.NODE_ENV === 'development',
});
const handler = await createFetchHandler(appRouter, {
    logger,
    docs:
        env.NODE_ENV === 'development'
            ? { title: 'shipkit API', version: '1.0.0' }
            : undefined,
});

export const orpc = (): MiddlewareHandler => async (c) => {
    const resHeaders = new Headers();
    const response = await handler.handle(c.req.raw, {
        reqHeaders: c.req.raw.headers,
        resHeaders,
        socketIp: getConnInfo(c).remote.address,
        auth: createAuth({
            headers: { request: c.req.raw.headers, response: resHeaders },
            storage: { database: db, redisClient: redis },
            config: authConfig,
        }),
        db,
        redis,
        logger,
    });
    const finalResponse = c.newResponse(response.body, response);
    resHeaders.forEach((value, key) => {
        finalResponse.headers.append(key, value);
    });
    return finalResponse;
};
