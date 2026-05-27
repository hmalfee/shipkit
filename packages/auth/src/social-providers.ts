import type { OAUTH_PROVIDER_IDS } from '@mento-mark/shared/constants';
import type { betterAuth } from 'better-auth';

import { env } from './env';

type BetterAuthSocialProviders = NonNullable<
    ReturnType<typeof betterAuth>['options']['socialProviders']
>;

type OAuthProviders = {
    [K in (typeof OAUTH_PROVIDER_IDS)[number]]: K extends keyof BetterAuthSocialProviders
        ? BetterAuthSocialProviders[K]
        : never;
};

/**
 * OAuth Provider Configuration
 *
 * To add a social provider:
 * 1. Register the provider in `packages/shared/src/constants.ts` (OAUTH_PROVIDERS)
 * 2. Set the OAuth app's redirect URI in the provider's dashboard to:
 *    `{BASE_URL}/auth/callback/{provider}` (e.g., http://localhost:3000/auth/callback/github)
 * 3. Add the provider config below with credentials from the OAuth app settings
 */

export const providersConfig = {
    google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: 'select_account',
    },
} satisfies OAuthProviders;

export const createSocialProviders = (baseURL?: string) =>
    Object.fromEntries(
        Object.entries(providersConfig).map(([key, config]) => [
            key,
            {
                // The below redirect URI is the same as what we set in oauth provider's dashboard.
                // We write the same thing in two places because the below will be validated by the
                // provider based on what we have in the provider's dashboard.
                redirectURI: baseURL
                    ? `${baseURL}/auth/callback/${key}`
                    : undefined,
                ...config,
            },
        ]),
    ) as {
        [K in keyof typeof providersConfig]: (typeof providersConfig)[K] & {
            redirectURI?: string;
        };
    } satisfies OAuthProviders;
