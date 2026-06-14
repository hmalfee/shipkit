// oxlint-disable eslint-js/no-restricted-syntax
import path from 'path';

import { config } from 'dotenv';
import { z } from 'zod';

import type { ZodRawShape } from 'zod';
import type { RulesBuilder, ValidationRule } from './rules-builder';
import type { ZodSchema } from './types';

import { applyRules } from './rules-builder';

/** Base server environment variables available to all configs. */
export const baseServer = {
    NODE_ENV: z.enum(['development', 'production', 'test']),
} satisfies ZodSchema;

export function loadEnvConfig(envDir?: string) {
    if (typeof window !== 'undefined') return;

    const baseDir = envDir ?? process.cwd();
    const nodeEnv = process.env.NODE_ENV;

    const envFiles = [
        nodeEnv && `.env.${nodeEnv}.local`,
        nodeEnv !== 'test' && '.env.local',
        nodeEnv && `.env.${nodeEnv}`,
        '.env',
    ].filter(Boolean) as string[];

    for (const file of envFiles) {
        const fullPath = path.resolve(baseDir, file);
        // Suppress dotenv logs like "injected env..." by passing quiet
        config({ path: fullPath, quiet: true } as Parameters<typeof config>[0]);
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
