import IORedis from 'ioredis';

import { logger } from '@shipkit/telemetry/logger';

let redisInstance: IORedis | undefined;

export function createRedisClient(redisUrl: string): IORedis {
    if (redisInstance) return redisInstance;

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
                logger.error('[REDIS] Max reconnection attempts reached');
                return null; // Stop retrying
            }
            return Math.min(times * 200, 2000); // Exponential backoff, capped at 2s
        },
    });

    // oxlint-disable-next-line eslint-js/no-restricted-syntax
    if (process.env.NODE_ENV === 'development') {
        client.on('connect', () => {
            logger.info('[REDIS] New connection established');
        });

        client.on('close', () => {
            logger.info('[REDIS] Connection removed');
        });
    }

    client.on('error', (err) => {
        logger.error('[REDIS]', { error: err });
    });

    redisInstance = client;
    return redisInstance;
}

type Redis = IORedis;

export { type Redis };
