import IORedis from 'ioredis';

import { logger } from '@mento-mark/telemetry/logger';

import { env } from '../env';

let redisInstance: IORedis | undefined;

function createRedisClient(redisUrl: string) {
    const { hostname, port, username, password, pathname, protocol } = new URL(
        redisUrl,
    );

    const db = parseInt(pathname.slice(1), 10);

    const client = new IORedis({
        host: hostname,
        port: port ? parseInt(port, 10) : 6379,
        username: username || undefined,
        password: password || undefined,
        db: isNaN(db) ? undefined : db,
        tls: protocol === 'rediss:' ? {} : undefined,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        retryStrategy(times) {
            if (times > 5) {
                logger.error('[REDIS] Max reconnection attempts reached', {
                    component: 'redis',
                });
                return null; // Stop retrying
            }
            return Math.min(times * 200, 2000); // Exponential backoff, capped at 2s
        },
    });

    if (env.NODE_ENV === 'development') {
        client.on('connect', () => {
            logger.info('[REDIS] New connection established', {
                component: 'redis',
            });
        });

        client.on('close', () => {
            logger.info('[REDIS] Connection removed', { component: 'redis' });
        });
    }

    client.on('error', (err) => {
        logger.error('[REDIS]', { err, component: 'redis' });
    });

    return client;
}

export function getRedisClient(): IORedis {
    if (redisInstance) {
        return redisInstance;
    }

    const redisUrl = env.REDIS_URL;

    try {
        redisInstance = createRedisClient(redisUrl);
        return redisInstance;
    } catch (error) {
        logger.error('[REDIS] Failed to initialize Redis client', {
            error,
            component: 'redis',
        });
        throw error;
    }
}

export const redis = getRedisClient();

type Redis = IORedis;

export { type Redis };
