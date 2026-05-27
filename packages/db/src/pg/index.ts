import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { logger } from '@mento-mark/telemetry/logger';

import { env } from '../env';
import * as schema from './schema';

const pool = new Pool({
    connectionString: env.POSTGRES_URL,
});

if (env.NODE_ENV === 'development') {
    pool.on('connect', () => {
        logger.info('[POSTGRES] New connection established', {
            component: 'postgres',
        });
    });

    pool.on('remove', () => {
        logger.info('[POSTGRES] Connection removed from the pool', {
            component: 'postgres',
        });
    });
}

pool.on('error', (err) => {
    logger.error('[POSTGRES]', { err, component: 'postgres' });
});

const db = drizzle(pool, { schema });

type Database = typeof db;

export { db, pool, type Database };
export * from 'drizzle-orm';
export type TestType = string;
