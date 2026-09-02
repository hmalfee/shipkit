import { generateDrizzleSchema } from 'auth/api';
import { getSchema } from 'better-auth/db';

import type { redisStorage } from '@better-auth/redis-storage';
import type { AuthDatabase } from './config';

import { createBetterAuthConfig } from './config';

export type { DBFieldType } from 'better-auth/db';

type Redis = Parameters<typeof redisStorage>[0]['client'];

export async function generateAuthSchema() {
    const auth = createBetterAuthConfig(
        {} as AuthDatabase,
        {} as Redis,
        'http://localhost',
        {
            secret: '',
            useSecureCookies: false,
            oauth: { google: { clientId: '', clientSecret: '' } },
        },
    );

    const { options, adapter } = await auth.$context;
    const schema = getSchema(options);

    const { code: drizzleSchemaCode } = await generateDrizzleSchema({
        options,
        // @ts-expect-error - The adapter type is not compatible with the expected
        // type in generateDrizzleSchema, but still safe for code generation.
        adapter,
        file: '',
    });

    if (!drizzleSchemaCode) {
        throw new Error('Failed to generate drizzle schema code');
    }

    // getSchema(options) only sees BetterAuthOptions, never the adapter,
    // so its keys are always the raw, unpluralized model name — it has
    // no way to know usePlural is set. Read it straight off the real
    // adapter instance instead, which better-auth resolves usePlural
    // onto directly.
    const plural = Boolean(adapter.options?.usePlural);

    const tables = Object.entries(schema)
        .map(([tableName, data]) => ({
            name: plural ? `${tableName}s` : tableName,
            fields: data.fields,
            order: data.order || Infinity,
        }))
        .sort((a, b) => a.order - b.order);

    return { drizzleSchemaCode, tables };
}
