import { redisStorage } from '@better-auth/redis-storage';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import type { Redis } from '@shipkit/db/redis';
import type { USER_ROLE_VALUES } from '@shipkit/shared/constants';
import type { TablesRelationalConfig } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { OAuthProvidersConfig } from './social-providers';

import { cookieForwarderPlugin } from './plugins/cookie-forwarder';
import { buildOAuthProviders } from './social-providers';

export type AuthDatabase = PgDatabase<
    PgQueryResultHKT,
    Record<string, unknown>,
    TablesRelationalConfig
>;

export type AuthConfig = {
    secret: string;
    useSecureCookies: boolean;
    oauth: OAuthProvidersConfig;
};

// ── Better Auth instance config (not exported directly as API) ─────────────
/**
 * When you modify this config (add plugins, additional fields, etc.), regenerate
 * the schema by running:
 *   pnpm --filter @shipkit/auth auth:generate
 *
 * Then apply changes from src/auth.temp.ts to packages/db/src/pg/schema/auth.ts,
 * making sure to use authSchema.table instead of pgTable from drizzle-orm/pg-core.
 */
export function createBetterAuthConfig(
    db: AuthDatabase,
    sessionCache: Redis,
    baseURL: string,
    config: AuthConfig,
) {
    const host = new URL(baseURL).hostname;
    // For sslip.io, the domain contains the IP address (e.g. 192.168.0.107.sslip.io) which is 6 parts
    // For standard domains, we take the top level and second level domain (e.g. example.com)
    const sharedDomain =
        host === 'localhost'
            ? undefined
            : host.endsWith('.sslip.io')
              ? host.split('.').slice(-6).join('.')
              : host.split('.').slice(-2).join('.');

    return betterAuth({
        appName: 'shipkit',
        secret: config.secret,
        database: drizzleAdapter(db, {
            provider: 'pg',
            usePlural: true,
        }),
        emailAndPassword: {
            enabled: true,
            autoSignIn: false,
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
        socialProviders: buildOAuthProviders(baseURL, config.oauth),
        onAPIError: {
            throw: true,
        },
        logger: {
            disabled: true,
        },
        advanced: {
            useSecureCookies: config.useSecureCookies,
            database: {
                generateId: false, // let Drizzle handle UUID generation
            },
            cookiePrefix: 'auth:',
            ...(sharedDomain
                ? {
                      crossSubDomainCookies: {
                          enabled: true,
                          domain: sharedDomain,
                      },
                  }
                : {}),
        },
        secondaryStorage: redisStorage({
            client: sessionCache,
            keyPrefix: 'auth:',
        }),

        plugins: [
            cookieForwarderPlugin(), // must be last
        ],
        rateLimit: {
            enabled: false,
        },
    });
}

export type Roles = typeof USER_ROLE_VALUES;
