import { redisStorage } from '@better-auth/redis-storage';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import type { USER_ROLE_VALUES } from '@mento-mark/shared/constants';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { Redis } from 'ioredis';

import { env } from './env';
import { responseCookies } from './plugins/response-cookies';
import { createSocialProviders } from './social-providers';
import { authStore } from './store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthDatabase = PgDatabase<PgQueryResultHKT, any, any>;

// Better-Auth does not natively support array enums for additional fields.
// To work around this, we configure Better-Auth to expect a generic 'string[]',
// while our PostgreSQL schema enforces a strict custom 'pgEnum' array in packages/db/src/pg/schema/auth.ts.
// Finally, we cast the session type definitions to reflect the strict 'Roles[]' type.
type Roles = typeof USER_ROLE_VALUES;

// ── Better Auth instance (not exported directly) ─────────────────────
/**
 * When you modify this config (add plugins, additional fields, etc.), regenerate
 * the schema by running:
 *   pnpm --filter @mento-mark/auth auth:generate
 *
 * Then apply changes from src/auth.temp.ts to packages/db/src/pg/schema/auth.ts,
 * making sure to use authSchema.table instead of pgTable from drizzle-orm/pg-core.
 */
function buildAuth(db: AuthDatabase, sessionCache: Redis, baseURL?: string) {
    return betterAuth({
        appName: 'mento-mark',
        database: drizzleAdapter(db, {
            provider: 'pg',
            usePlural: true,
        }),
        emailAndPassword: {
            enabled: true,
        },
        user: {
            additionalFields: {
                roles: {
                    type: 'string[]',
                    required: false,
                    input: false,
                },
            },
        },
        baseURL,
        basePath: '/auth',
        socialProviders: createSocialProviders(baseURL),
        onAPIError: {
            throw: true,
        },
        logger: {
            disabled: true,
        },
        advanced: {
            useSecureCookies: env.USE_SECURE_COOKIES,
            database: {
                generateId: false, // let Drizzle handle UUID generation
            },
            cookiePrefix: 'auth:',
        },
        secondaryStorage: redisStorage({
            client: sessionCache,
            keyPrefix: 'auth:',
        }),

        plugins: [
            responseCookies(), // must be last
        ],
        rateLimit: {
            enabled: false,
        },
    });
}

let _authInstance: ReturnType<typeof buildAuth> | undefined;

function getAuthInstance(
    db: AuthDatabase,
    sessionCache: Redis,
    baseURL?: string,
) {
    _authInstance ??= buildAuth(db, sessionCache, baseURL);
    return _authInstance;
}

// ── CLI Export ───────────────────────────────────────────────────────
// Required by better-auth CLI to generate the schema
export const auth = process.argv.join(' ').includes('better-auth')
    ? buildAuth({} as AuthDatabase, {} as Redis)
    : undefined;

// ── Flattened auth API type ──────────────────────────────────────────

type BetterAuthAPI = ReturnType<typeof buildAuth>['api'];
type DefaultSession = ReturnType<typeof buildAuth>['$Infer']['Session'];

/**
 * Session with strictly typed roles enum (not just string[])
 */
type StrictSession = Omit<DefaultSession, 'user'> & {
    user: DefaultSession['user'] & {
        roles: Roles;
    };
};

export type Auth = {
    [K in keyof BetterAuthAPI as K extends 'getSession'
        ? never
        : K]: BetterAuthAPI[K] extends (options?: infer O) => infer R
        ? NonNullable<O> extends { body: infer B }
            ? (body: B) => R
            : () => R
        : BetterAuthAPI[K];
} & {
    $passthrough: (request: Request) => Promise<Response>;
    getSession: () => Promise<StrictSession | null>;
};

// ── createAuth proxy ─────────────────────────────────────────────────

export interface CreateAuthContext {
    headers: { request: Headers; response: Headers };
    storage: { database: AuthDatabase; sessionCache: Redis };
    baseURL: string;
}

/**
 * Creates a proxied auth API that:
 * 1. Auto-injects request headers into every API call
 * 2. Forwards set-cookie headers from auth responses to resHeaders
 *    via AsyncLocalStorage + the response-cookies plugin
 */
export function createAuth(ctx: CreateAuthContext): Auth {
    const authInstance = getAuthInstance(
        ctx.storage.database,
        ctx.storage.sessionCache,
        ctx.baseURL,
    );

    return new Proxy({} as Auth, {
        get(_, prop: string) {
            // Raw request passthrough for OAuth callbacks
            if (prop === '$passthrough') {
                return (request: Request) =>
                    authStore.run({ resHeaders: ctx.headers.response }, () =>
                        authInstance.handler(request),
                    );
            }

            const fn = authInstance.api[prop as keyof typeof authInstance.api];
            if (typeof fn !== 'function') return fn;

            return (arg?: unknown) => {
                const opts: Record<string, unknown> = {
                    headers: ctx.headers.request,
                    baseURL: ctx.baseURL,
                };

                if (arg !== undefined) {
                    opts.body = arg;
                }

                return authStore.run({ resHeaders: ctx.headers.response }, () =>
                    (fn as (opts: Record<string, unknown>) => unknown)(opts),
                );
            };
        },
    });
}
