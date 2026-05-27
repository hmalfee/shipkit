// oxlint-disable eslint-js/no-restricted-syntax
import path from 'node:path';

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

/**
 * Loads environment variables from .env file using dotenv.
 * Resolves the .env location relative to the calling file's directory.
 * No-op if called in browser environment.
 *
 * @param envDir Optional explicit directory to load .env from. Defaults to caller's directory.
 */
export function loadEnvConfig(envDir?: string) {
    if (typeof window !== 'undefined') return;

    const dir = envDir ?? getCallerDir();
    if (dir) {
        config({ path: path.resolve(dir, '..', '.env'), quiet: true });
    }
}

/**
 * Builds shared configuration options for @t3-oss/env-core.
 * Includes empty string handling, validation skipping, and custom validation rules.
 *
 * @param opts Configuration including optional validation rules
 * @returns Configuration object (excludes `runtimeEnv` \u2014 caller must provide)
 */
export function buildSharedConfig<T extends ZodRawShape>(opts: {
    rules?: (
        build: RulesBuilder<T>,
    ) => ValidationRule<Record<string, unknown>>[];
}) {
    return {
        emptyStringAsUndefined: true,
        skipValidation: !!process.env.SKIP_ENV_VALIDATION,
        createFinalSchema: opts.rules
            ? (shape: ZodRawShape) => applyRules(shape as T, opts.rules!)
            : undefined,
    };
}
