// oxlint-disable eslint-js/no-restricted-syntax
import path from 'path';

import { config } from 'dotenv';
import { z } from 'zod';

import type { ZodRawShape } from 'zod';
import type { RulesBuilder, ValidationRule } from './rules-builder';
import type { ZodSchema } from './types';

import { getCallerDir } from './caller';
import { applyRules } from './rules-builder';

/** Base server environment variables available to all configs. */
export const baseServer = {
    NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .default('development'),
} satisfies ZodSchema;

export function loadEnvConfig(envDir?: string) {
    if (typeof window !== 'undefined') return;

    const dir = envDir ?? getCallerDir();
    if (dir) {
        config({ path: path.resolve(dir, '..', '.env'), quiet: true });
    }
}

export function buildSharedConfig<T extends ZodRawShape>(opts: {
    clientKeys?: string[];
    rules?: (
        rules: RulesBuilder<T>,
    ) => ValidationRule<Record<string, unknown>>[];
}) {
    return {
        emptyStringAsUndefined: true,
        skipValidation: !!process.env.SKIP_ENV_VALIDATION,
        createFinalSchema: opts.rules
            ? (shape: ZodRawShape) =>
                  applyRules(shape as T, opts.rules!, opts.clientKeys)
            : undefined,
    };
}
