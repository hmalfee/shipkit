import { getTableColumns } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { logger } from '@shipkit/telemetry/logger';

import type { Table } from 'drizzle-orm';

import * as schema from './schema';

let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function createDb(connectionString: string, { debug = false } = {}) {
    if (instance) return instance;

    const pool = new Pool({ connectionString });

    if (debug) {
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

type ColumnsOf<T extends Table> = T['_']['columns'];

/** Only the columns whose mask value is `true`. */
type Picked<T extends Table, M> = {
    [
        K in keyof M & keyof ColumnsOf<T> as M[K] extends true ? K : never
    ]: ColumnsOf<T>[K];
};

/**
 * Exhaustive column allowlist: every column must be listed as `true`
 * (exposed) or `false` (hidden). Adding a column to the table makes
 * every call site fail typecheck until a decision is made.
 */
export function pickColumns<
    T extends Table,
    const M extends Record<keyof ColumnsOf<T>, boolean>,
>(table: T, mask: M): Picked<T, M> {
    const all = getTableColumns(table) as Record<string, unknown>;
    return Object.fromEntries(
        Object.entries(mask)
            .filter(([, expose]) => expose)
            .map(([key]) => [key, all[key]]),
    ) as Picked<T, M>;
}

export * from 'drizzle-orm';
