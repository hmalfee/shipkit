// oxlint-disable eslint-js/no-restricted-syntax
import { createEnv as _createEnv } from '@t3-oss/env-core';

import type { CreateEnvOptions, InferSchema, ZodSchema } from './types';

import { baseServer, buildSharedConfig, loadEnvConfig } from './core';

export type * from './types';

type Env<TServer extends ZodSchema, TClient extends ZodSchema> = Readonly<
    InferSchema<typeof baseServer> & InferSchema<TServer> & InferSchema<TClient>
>;

/**
 * Creates and validates environment variables.
 *
 * @example
 * // Server-only
 * export const env = createEnv({
 *   server: { DB_URL: z.string().url() },
 * });
 *
 * @example
 * // With client prefix (e.g., Next.js)
 * export const env = createEnv({
 *   server: { DB_URL: z.string().url() },
 *   client: { NEXT_PUBLIC_API_URL: z.string().url() },
 *   clientPrefix: 'NEXT_PUBLIC_',
 *   clientAccess: { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL },
 * });
 */
export function createEnv<
    TServer extends ZodSchema = NonNullable<unknown>,
    TClient extends ZodSchema = NonNullable<unknown>,
    TPrefix extends string | undefined = undefined,
>(
    opts: CreateEnvOptions<TServer, TClient, typeof baseServer, TPrefix>,
): Env<TServer, TClient> {
    loadEnvConfig(opts.envDir);

    return _createEnv({
        ...opts,
        ...buildSharedConfig({
            clientKeys: opts.client ? Object.keys(opts.client) : undefined,
            rules: opts.rules,
        }),
        runtimeEnv: {
            ...process.env,
            ...(opts as { clientAccess?: Record<string, unknown> })
                .clientAccess,
        },
        clientPrefix: opts.clientPrefix ?? '',
        server: {
            ...baseServer,
            ...opts.server,
        },
    } as never) as never;
}
