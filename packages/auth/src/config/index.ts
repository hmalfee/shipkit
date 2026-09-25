import { redisStorage } from '@better-auth/redis-storage';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import type { AuthConfig, AuthDatabase, Redis } from './types';

import {
    changeEmailBeforeHooks,
    changeEmailBeforeUserUpdateHooks,
    getChangeEmailConfig,
    sendChangeEmailVerification,
} from './change-email';
import { getPendingDisplayEmail, getSocialProvidersConfig } from './oauth';
import { cookieForwarderPlugin } from './plugins/cookie-forwarder';
import { emailSignInPlugin } from './plugins/email-sign-in';
import { composePathBasedDbHooks, composePathBasedHooks } from './utils/hooks';

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
                    defaultValue: getPendingDisplayEmail,
                },
            },
            changeEmail: getChangeEmailConfig(config),
        },
        emailVerification: {
            sendVerificationEmail: async (data) => {
                await sendChangeEmailVerification(config, data);
            },
        },
        // Dummy baseURL, so that query params on a url can be parsed correctly.
        baseURL: 'http://auth',
        socialProviders: getSocialProvidersConfig(config),
        hooks: composePathBasedHooks({
            before: {
                ...changeEmailBeforeHooks(),
            },
        }),
        databaseHooks: composePathBasedDbHooks({
            user: {
                update: {
                    before: {
                        ...changeEmailBeforeUserUpdateHooks(),
                    },
                },
            },
        }),
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

export * from './types';
