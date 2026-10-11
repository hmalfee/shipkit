import { redisStorage } from '@better-auth/redis-storage';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import type { AuthConfig, AuthDatabase, Redis } from './types';

import { resolveAuthDefaults } from './defaults';
import { getPendingDisplayEmail, getSocialProvidersConfig } from './oauth';
import { changeEmailPlugin } from './plugins/change-email';
import { cookieForwarderPlugin } from './plugins/cookie-forwarder';
import { emailSignInPlugin } from './plugins/email-sign-in';

export function createBetterAuthConfig(
    db: AuthDatabase,
    redisClient: Redis,
    config: AuthConfig,
) {
    const { otp, changeEmail } = resolveAuthDefaults(config);

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
                    defaultValue: getPendingDisplayEmail,
                },
            },
        },
        // Dummy baseURL, so that query params on a url can be parsed correctly.
        baseURL: 'http://auth',
        socialProviders: getSocialProvidersConfig(config),
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
                otp,
                onSendSignInEmail: config.onSendSignInEmail,
            }),
            changeEmailPlugin({
                otp,
                onSendChangeEmail: config.onSendChangeEmail,
                ...changeEmail,
            }),
            cookieForwarderPlugin(), // must be last
        ],
        rateLimit: {
            enabled: false,
        },
    });
}

export * from './types';
