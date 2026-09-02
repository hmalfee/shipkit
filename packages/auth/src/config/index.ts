import { redisStorage } from '@better-auth/redis-storage';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import type { USER_ROLE_VALUES } from '@shipkit/shared/constants';
import type { TablesRelationalConfig } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { OAuthProvidersConfig } from './social-providers';

import { cookieForwarderPlugin } from './plugins/cookie-forwarder';
import { emailSignInPlugin } from './plugins/email-sign-in';
import { buildOAuthProviders } from './social-providers';

type Redis = Parameters<typeof redisStorage>[0]['client'];

export type AuthDatabase = PgDatabase<
    PgQueryResultHKT,
    Record<string, unknown>,
    TablesRelationalConfig
>;

export type AuthConfig = {
    secret: string;
    useSecureCookies: boolean;
    oauth: OAuthProvidersConfig;
    onSendSignInEmail?: (payload: {
        email: string;
        otp: string;
        magicLink: {
            url: string;
            token: string;
        };
        expiresInMinutes: number;
    }) => Promise<void>;
};

export function createBetterAuthConfig(
    db: AuthDatabase,
    redisClient: Redis,
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
            client: redisClient,
            keyPrefix: 'auth:',
        }),

        plugins: [
            emailSignInPlugin({
                onSendSignInEmail: config.onSendSignInEmail,
            }),
            cookieForwarderPlugin(), // must be last
        ],
        rateLimit: {
            enabled: false,
        },
    });
}

export type Roles = typeof USER_ROLE_VALUES;
