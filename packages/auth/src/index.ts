import type { Redis } from 'ioredis';
import type { AuthDatabase, Roles } from './config';

import { createBetterAuthConfig } from './config';
import { authRequestContext } from './context-store';

let _authInstance: ReturnType<typeof createBetterAuthConfig> | undefined;

function getOrCreateAuthInstance(
    db: AuthDatabase,
    sessionCache: Redis,
    baseURL: string,
) {
    _authInstance ??= createBetterAuthConfig(db, sessionCache, baseURL);
    return _authInstance;
}

type BetterAuthAPI = ReturnType<typeof createBetterAuthConfig>['api'];
type DefaultSession = ReturnType<
    typeof createBetterAuthConfig
>['$Infer']['Session'];

/**
 * Session with strictly typed roles enum (not just string[])
 */
export type StrictSession = Omit<DefaultSession, 'user'> & {
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
    const authInstance = getOrCreateAuthInstance(
        ctx.storage.database,
        ctx.storage.sessionCache,
        ctx.baseURL,
    );

    return new Proxy({} as Auth, {
        get(_, prop: string) {
            // Raw request passthrough for OAuth callbacks
            if (prop === '$passthrough') {
                return (request: Request) =>
                    authRequestContext.run(
                        { resHeaders: ctx.headers.response },
                        () => authInstance.handler(request),
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

                return authRequestContext.run(
                    { resHeaders: ctx.headers.response },
                    () =>
                        (fn as (opts: Record<string, unknown>) => unknown)(
                            opts,
                        ),
                );
            };
        },
    });
}
