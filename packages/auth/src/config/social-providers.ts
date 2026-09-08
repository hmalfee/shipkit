import { APIError, BASE_ERROR_CODES } from 'better-auth';
import { z } from 'zod/mini';

import type { OAUTH_PROVIDER_IDS } from '@shipkit/shared/constants';
import type { betterAuth } from 'better-auth';

import { normalizeEmail, sanitizeEmail } from './utils/email-validation';

type BetterAuthOAuthProviders = NonNullable<
    ReturnType<typeof betterAuth>['options']['socialProviders']
>;

type OAuthProviders = {
    [
        K in (typeof OAUTH_PROVIDER_IDS)[number]
    ]: K extends keyof BetterAuthOAuthProviders
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
 * Normalizes an OAuth provider's email so better-auth's existing-user lookup
 * matches correctly instead of misdiagnosing returning users as new signups.
 */
function mapOAuthProfileEmail(profile: unknown) {
    const parsed = z.object({ email: z.email() }).safeParse(profile);
    if (!parsed.success) {
        throw new APIError('BAD_REQUEST', {
            code: BASE_ERROR_CODES.INVALID_EMAIL.code,
            message: 'OAuth provider did not return a valid email',
        });
    }

    const sanitized = sanitizeEmail(parsed.data.email);
    const normalized = normalizeEmail(sanitized);
    return {
        email: normalized,
        displayEmail: sanitized,
    };
}

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
                // Applies to every provider by default; a provider can override this
                // by setting its own `mapProfileToUser` in `oauthProvidersConfig` above.
                mapProfileToUser: mapOAuthProfileEmail,
                ...config,
            },
        ]),
    ) as {
        [
            K in keyof typeof oauthProvidersConfig
        ]: (typeof oauthProvidersConfig)[K] & {
            redirectURI?: string;
            mapProfileToUser?: typeof mapOAuthProfileEmail;
        };
    } satisfies OAuthProviders;
}
