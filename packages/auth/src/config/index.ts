import { redisStorage } from '@better-auth/redis-storage';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import type { USER_ROLE_VALUES } from '@shipkit/shared/constants';
import type { TablesRelationalConfig } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { OAuthProvidersConfig } from './social-providers';

import { databaseHooks, hooks } from './hooks';
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
    /**
     * Root domain for cross-subdomain cookie sharing. Use the most specific scope
     * needed to avoid exposing session cookies to untrusted subdomains. Omit if
     * all services share the same origin.
     */
    cookieDomain?: string;
    oauth: OAuthProvidersConfig;
    onSendSignInEmail?: (payload: {
        email: string;
        otp: string;
        magicLink: {
            token: string;
            callbackURL: string;
        };
        expiresInMinutes: number;
    }) => Promise<void>;
    onSendChangeEmailVerification?: (payload: {
        newEmail: string;
        token: string;
        callbackURL: string;
    }) => Promise<void>;
};

export function createBetterAuthConfig(
    db: AuthDatabase,
    redisClient: Redis,
    config: AuthConfig,
) {
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
                displayEmail: {
                    type: 'string',
                    required: true,
                    input: false,
                },
            },
            ...(config.onSendChangeEmailVerification
                ? {
                      changeEmail: {
                          enabled: true,
                          sendChangeEmailConfirmation: async ({
                              newEmail,
                              url,
                              token,
                          }) =>
                              config.onSendChangeEmailVerification?.({
                                  newEmail,
                                  token,
                                  callbackURL:
                                      new URL(url).searchParams.get(
                                          'callbackURL',
                                      ) ?? '',
                              }),
                      },
                  }
                : {}),
        },
        // Dummy baseURL, so that query params on a url can be parsed correctly.
        baseURL: 'http://auth',
        socialProviders: buildOAuthProviders(config.oauth),
        hooks,
        databaseHooks,
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
            ...(config.cookieDomain
                ? {
                      crossSubDomainCookies: {
                          enabled: true,
                          domain: config.cookieDomain,
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
                onSendSignInEmail: async (props) =>
                    // Better-auth builds its own magic-link URL, but that's not necessarily our
                    // backend's actual verification route. So we pass the token and callbackURL
                    // to let the consumer build the URL on their own.
                    config.onSendSignInEmail?.({
                        email: props.email,
                        otp: props.otp,
                        magicLink: {
                            token: props.magicLink.token,
                            callbackURL:
                                new URL(props.magicLink.url).searchParams.get(
                                    'callbackURL',
                                ) ?? '',
                        },
                        expiresInMinutes: props.expiresInMinutes,
                    }),
            }),
            cookieForwarderPlugin(), // must be last
        ],
        rateLimit: {
            enabled: false,
        },
    });
}

export type Roles = typeof USER_ROLE_VALUES;
