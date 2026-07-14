import type { OAUTH_PROVIDER_IDS } from '@shipkit/shared/constants';
import type { betterAuth } from 'better-auth';

type BetterAuthOAuthProviders = NonNullable<
    ReturnType<typeof betterAuth>['options']['socialProviders']
>;

type OAuthProviders = {
    [K in (typeof OAUTH_PROVIDER_IDS)[number]]: K extends keyof BetterAuthOAuthProviders
        ? BetterAuthOAuthProviders[K]
        : never;
};

export type OAuthProvidersConfig = Record<
    (typeof OAUTH_PROVIDER_IDS)[number],
    {
        clientId: string;
        clientSecret: string;
    }
>;

/**
 * OAuth Provider Configuration
 *
 * To add a social provider:
 * 1. Register the provider in `packages/shared/src/constants.ts` (OAUTH_PROVIDERS)
 * 2. Set the OAuth app's redirect URI in the provider's dashboard to:
 *    `{BASE_URL}/auth/callback/{provider}` (e.g., http://localhost:3000/auth/callback/github)
 * 3. Add the provider config below with credentials from the OAuth app settings
 */
export function buildOAuthProviders(
    baseURL: string,
    oauth: OAuthProvidersConfig,
) {
    const oauthProvidersConfig = {
        google: {
            clientId: oauth.google.clientId,
            clientSecret: oauth.google.clientSecret,
            prompt: 'select_account',
        },
    } satisfies OAuthProviders;

    return Object.fromEntries(
        Object.entries(oauthProvidersConfig).map(([key, config]) => [
            key,
            {
                // The below redirect URI is the same as what we set in oauth provider's dashboard.
                // We write the same thing in two places because the below will be validated by the
                // provider based on what we have in the provider's dashboard.
                redirectURI: `${baseURL}/auth/callback/${key}`,
                ...config,
            },
        ]),
    ) as {
        [K in keyof typeof oauthProvidersConfig]: (typeof oauthProvidersConfig)[K] & {
            redirectURI?: string;
        };
    } satisfies OAuthProviders;
}
