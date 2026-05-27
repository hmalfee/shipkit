// oxlint-disable eslint-js/no-restricted-syntax
import { createEnv as _createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

import type { CreateEnvOptions, InferSchema, ZodSchema } from './types';

import { baseServer, buildSharedConfig, loadEnvConfig } from './core';

export type * from './types';

/** Base client environment variables for Next.js. */
const baseClient = {
    NEXT_PUBLIC_ENV: z
        .enum(['development', 'production', 'test'])
        .default('development'),
} satisfies ZodSchema;

type Env<TServer extends ZodSchema, TClient extends ZodSchema> = Readonly<
    InferSchema<typeof baseServer> &
        InferSchema<typeof baseClient> &
        InferSchema<TServer> &
        InferSchema<TClient>
>;

/**
 * Creates and validates environment variables for Next.js applications.
 *
 * Client variables must be prefixed with `NEXT_PUBLIC_` and explicitly referenced via `process.env.NEXT_PUBLIC_*`
 * in the `clientAccess` parameter so they are statically analyzed and bundled by Next.js.
 *
 * You can also define cross-field validation rules using the `rules` property.
 *
 * @example
 * export const env = createEnv({
 *   server: {
 *     DB_URL: z.string().url(),
 *     GITHUB_ID: z.string().optional(),
 *     GOOGLE_ID: z.string().optional(),
 *   },
 *   client: {
 *     NEXT_PUBLIC_API_URL: z.string().url(),
 *   },
 *   clientAccess: {
 *     NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
 *   },
 *   rules: (build) => [
 *     build.atLeastOne(["GITHUB_ID", "GOOGLE_ID"]),
 *   ],
 * });
 */
export function createEnv<
    TServer extends ZodSchema = NonNullable<unknown>,
    TClient extends ZodSchema = NonNullable<unknown>,
>(
    opts: CreateEnvOptions<
        TServer,
        TClient,
        typeof baseServer & typeof baseClient,
        'NEXT_PUBLIC_'
    > & {
        clientAccess: Record<
            NoInfer<keyof TClient>,
            string | boolean | number | undefined
        >;
    },
): Env<TServer, TClient> {
    loadEnvConfig(opts.envDir);

    return _createEnv({
        ...opts,
        ...buildSharedConfig(opts),
        runtimeEnv: {
            ...process.env,
            ...opts.clientAccess,
            NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV,
        },
        clientPrefix: 'NEXT_PUBLIC_',
        server: {
            ...baseServer,
            ...opts.server!,
        },
        client: {
            ...baseClient,
            ...opts.client!,
        },
    } as never) as never;
}
