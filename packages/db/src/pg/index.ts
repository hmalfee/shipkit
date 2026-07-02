import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { logger } from '@mento-mark/telemetry/logger';

import * as schema from './schema';

let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function createDb(connectionString: string) {
    if (instance) return instance;

    const pool = new Pool({ connectionString });

    // oxlint-disable-next-line eslint-js/no-restricted-syntax
    if (process.env.NODE_ENV === 'development') {
        pool.on('connect', () => {
            logger.info('[POSTGRES] New connection established');
        });

        pool.on('remove', () => {
            logger.info('[POSTGRES] Connection removed from the pool');
        });
    }

    pool.on('error', (err) => {
        logger.error('[POSTGRES]', { error: err });
    });

    instance = drizzle(pool, { schema });
    return instance;
}

type Database = ReturnType<typeof createDb>;

export { type Database };
export * from 'drizzle-orm';
