import { resolve } from 'node:path';

import { format, resolveConfig } from 'prettier';

import { generateAuthSchema } from '@shipkit/auth/db';

const SCHEMA_DIR = resolve(import.meta.dirname, '../../src/pg/schema');
export const AUTH_FILE = resolve(SCHEMA_DIR, 'auth.ts');
export const DIFF_FILE = resolve(SCHEMA_DIR, 'auth.schema.diff');

export const YELLOW = '\x1b[33m';
export const GREEN = '\x1b[32m';
export const RED = '\x1b[31m';
export const RESET = '\x1b[0m';

/**
 * The generated baseline — generated straight from the @shipkit/auth
 * package's config, formatted with the repo's prettier config. gen,
 * diff and validate all compare against this.
 */
export async function getSchemaBaseline(): Promise<string> {
    const prettierConfig = await resolveConfig('@shipkit/prettier-config');
    const { drizzleSchemaCode } = await generateAuthSchema();

    return format(drizzleSchemaCode, {
        parser: 'typescript',
        ...prettierConfig,
    });
}
