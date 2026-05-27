import type { z } from 'zod';
import type { RulesBuilder, ValidationRule } from './rules-builder';

/** Schema record mapping variable names to Zod validators. */
export type ZodSchema = Record<string, z.ZodType>;

/** Infers the TypeScript type from a Zod schema record. */
export type InferSchema<T extends ZodSchema> = {
    [K in keyof T]: z.infer<T[K]>;
};

/**
 * Configuration options for `createEnv()`.
 *
 * @template TServer Zod schema for server variables
 * @template TClient Zod schema for client variables
 * @template TExtra Extra base variables (e.g., NODE_ENV, NEXT_PUBLIC_ENV)
 * @template TPrefix Client prefix (e.g., 'NEXT_PUBLIC_', 'VITE_PUBLIC_')
 */
export type CreateEnvOptions<
    TServer extends ZodSchema,
    TClient extends ZodSchema,
    TExtra extends ZodSchema = NonNullable<unknown>,
    TPrefix extends string | undefined = undefined,
> = {
    envDir?: string;
    clientPrefix?: TPrefix;
    server?: TServer;
    client?: TPrefix extends string
        ? {
              [K in keyof TClient]: K extends `${TPrefix}${string}`
                  ? TClient[K]
                  : `Error: Key '${K & string}' must start with '${TPrefix}'`;
          }
        : TClient;
    /**
     * Define cross-field validation rules for your environment variables.
     *
     * @example
     * rules: (build) => [
     *     // Ensure at least one of these two keys is provided
     *     build.atLeastOne(["GITHUB_CLIENT_ID", "GOOGLE_CLIENT_ID"]),
     *     // Ensure both are provided if one is, or neither if not
     *     build.allOrNone(["SENTRY_ORG", "SENTRY_PROJECT"]),
     * ]
     */
    rules?: (
        build: RulesBuilder<TServer & TClient & TExtra>,
    ) => ValidationRule<Record<string, unknown>>[];
};
