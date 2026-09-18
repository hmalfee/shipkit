import { type redisStorage } from '@better-auth/redis-storage';

import type { AuthConfig, AuthDatabase, Roles } from './config';

import { createBetterAuthConfig } from './config';
import { authRequestContext } from './context-store';

let _authInstance: ReturnType<typeof createBetterAuthConfig> | undefined;

type Redis = Parameters<typeof redisStorage>[0]['client'];

function getOrCreateAuthInstance(
    db: AuthDatabase,
    redisClient: Redis,
    config: AuthConfig,
) {
    _authInstance ??= createBetterAuthConfig(db, redisClient, config);
    return _authInstance;
}

type BetterAuthAPI = ReturnType<typeof createBetterAuthConfig>['api'];
type DefaultSession = ReturnType<
    typeof createBetterAuthConfig
>['$Infer']['Session'];

/** The full options object a given better-auth endpoint accepts. */
type OptionsOf<K extends keyof BetterAuthAPI> = NonNullable<
    Parameters<BetterAuthAPI[K]>[0]
>;

/** Only the input shapes we let external callers set via $api. */
type CallOpts<K extends keyof BetterAuthAPI> = Pick<
    OptionsOf<K>,
    Extract<keyof OptionsOf<K>, 'body' | 'query' | 'params'>
>;

/**
 * Session with strictly typed roles enum (not just string[])
 */
export type StrictSession = Omit<DefaultSession, 'user'> & {
    user: DefaultSession['user'] & {
        roles: Roles;
    };
};

type BetterAuthAPIMethods = {
    [
        K in keyof BetterAuthAPI as K extends 'getSession' ? never : K
    ]: BetterAuthAPI[K] extends (options?: infer O) => infer R
        ? NonNullable<O> extends { body: infer B }
            ? (body: B) => R
            : () => R
        : BetterAuthAPI[K];
};

export type Auth = BetterAuthAPIMethods & {
    getSession: () => Promise<StrictSession | null>;
    $api: <K extends keyof BetterAuthAPI>(
        endpointName: K,
        opts: CallOpts<K>,
    ) => Promise<Response>;
};

export interface CreateAuthContext {
    headers: { request: Headers; response: Headers };
    storage: { database: AuthDatabase; redisClient: Redis };
    config: AuthConfig;
}

/**
 * Creates a proxied auth API that:
 * 1. Auto-injects request headers into every API call
 * 2. Forwards set-cookie headers from auth responses to resHeaders
 *    via AsyncLocalStorage + the response-cookies plugin
 */
export function createAuth(ctx: CreateAuthContext): Auth {
    const authInstance = getOrCreateAuthInstance(
        ctx.storage.database,
        ctx.storage.redisClient,
        ctx.config,
    );

    function invoke(endpointName: string, extraOpts: Record<string, unknown>) {
        const fn =
            authInstance.api[endpointName as keyof typeof authInstance.api];
        if (typeof fn !== 'function') {
            throw new Error(
                `"${endpointName}" is not a callable auth endpoint`,
            );
        }

        const opts: Record<string, unknown> = {
            headers: ctx.headers.request,
            ...extraOpts,
        };

        return authRequestContext.run(
            { resHeaders: ctx.headers.response },
            () => (fn as (opts: Record<string, unknown>) => unknown)(opts),
        );
    }

    return new Proxy({} as Auth, {
        get(_, prop: string) {
            if (prop === '$api') {
                return (
                    endpointName: string,
                    opts: Record<string, unknown> = {},
                ) => invoke(endpointName, { ...opts, asResponse: true });
            }

            const fn = authInstance.api[prop as keyof typeof authInstance.api];
            if (typeof fn !== 'function') return fn;

            return (arg?: unknown) =>
                invoke(prop, arg !== undefined ? { body: arg } : {});
        },
    });
}
