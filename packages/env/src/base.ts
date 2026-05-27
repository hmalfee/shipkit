// oxlint-disable eslint-js/no-restricted-syntax
import { createEnv as _createEnv } from '@t3-oss/env-core';

import type { CreateEnvOptions, InferSchema, ZodSchema } from './types';

import { baseServer, buildSharedConfig, loadEnvConfig } from './core';

export type * from './types';

type Env<TServer extends ZodSchema, TClient extends ZodSchema> = Readonly<
    InferSchema<typeof baseServer> & InferSchema<TServer> & InferSchema<TClient>
>;

/**
 * Creates and validates environment variables for generic (non-Next.js) environments.
 *
 * Supports custom client prefixes (e.g., `VITE_PUBLIC_` for Vite, `PUBLIC_` for SvelteKit).
 * You can also define cross-field validation rules using the `rules` property.
 *
 * @example
 * export const env = createEnv({
 *   server: {
 *     DB_URL: z.string().url(),
 *     API_KEY: z.string(),
 *   },
 *   client: {
 *     VITE_PUBLIC_API_URL: z.string().url(),
 *   },
 *   clientPrefix: 'VITE_PUBLIC_',
 *   rules: (build) => [
 *     build.atLeastOne(["API_KEY", "OAUTH_TOKEN"]),
 *   ],
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
        ...buildSharedConfig(opts),
        runtimeEnv: process.env,
        clientPrefix: opts.clientPrefix ?? '',
        server: {
            ...baseServer,
            ...opts.server!,
        },
    } as never) as never;
}
