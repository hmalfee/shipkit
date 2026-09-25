// --------   OAuth Provider Configuration   --------
//   To add a social provider:
//   1. Register the provider in `packages/shared/src/constants.ts` (OAUTH_PROVIDERS)
//   2. Set the OAuth app's redirect URI in the provider's dashboard to:
//      `{BASE_URL}/auth/callback/{provider}` (e.g., http://localhost:3000/auth/callback/github)
//   3. Add the provider config below with credentials from the OAuth app settings

import { APIError, BASE_ERROR_CODES } from 'better-auth';
import { z } from 'zod/mini';

import type { OAUTH_PROVIDER_IDS } from '@shipkit/shared/constants';
import type { BetterAuthOptions } from 'better-auth';
import type { AuthConfig } from './types';

import { authRequestContext } from '../context-store';
import { normalizeEmail, sanitizeEmail } from './utils/email-validation';

type BetterAuthOAuthProviders = NonNullable<
    BetterAuthOptions['socialProviders']
>;

type OAuthProviders = {
    [
        K in (typeof OAUTH_PROVIDER_IDS)[number]
    ]: K extends keyof BetterAuthOAuthProviders
        ? BetterAuthOAuthProviders[K]
        : never;
};

/**
 * Normalizes an OAuth provider's email so better-auth's existing-user lookup
 * matches returning users instead of misdiagnosing them as new signups.
 *
 * Also stashes the sanitized (non-normalized) email in `authRequestContext` as
 * the display email, for `getPendingDisplayEmail` to consume in the same request.
 * Needed because `displayEmail` is `input: false`, so better-auth's
 * `parseAdditionalUserInputFromProviderProfile` silently drops any value
 * returned here. `input: true` isn't an option, since it would let SDK
 * consumers set `displayEmail` to an arbitrary value.
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

    const store = authRequestContext.getStore();
    if (store) store.pendingDisplayEmail = sanitized;

    return {
        email: normalized,
    };
}

/**
 * Consumes and clears the display email stashed by `mapOAuthProfileEmail`.
 * Use as the default value for `displayEmail` in better-auth's user schema.
 *
 * `defaultValue()` only runs when no value is provided, so this only runs for
 * new users; flows that supply `displayEmail` themselves (e.g. magic link)
 * never reach it. Since `mapOAuthProfileEmail` stashes the value beforehand, it
 * is present whenever this runs.
 */
export function getPendingDisplayEmail(): string {
    const store = authRequestContext.getStore();
    const displayEmail = store?.pendingDisplayEmail;
    if (store) store.pendingDisplayEmail = undefined;
    if (!displayEmail) {
        const { code, message } = BASE_ERROR_CODES.FAILED_TO_CREATE_USER;
        throw new APIError('INTERNAL_SERVER_ERROR', { code, message });
    }
    return displayEmail;
}

export function getSocialProvidersConfig(
    config: AuthConfig,
): BetterAuthOptions['socialProviders'] {
    const oauth = config.oauth;

    if (
        !oauth.redirectURITemplate ||
        !/\{[^}]+\}/.test(oauth.redirectURITemplate)
    ) {
        throw new APIError('INTERNAL_SERVER_ERROR', {
            code: BASE_ERROR_CODES.INVALID_REDIRECT_URL.code,
            message:
                'OAuth redirectURITemplate must contain a placeholder (e.g., {provider})',
        });
    }

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
            // The below config applies to every provider by default; override this by providing a
            // different value for them in `oauthProvidersConfig` above.
            {
                redirectURI: oauth.redirectURITemplate.replace(
                    /\{[^}]+\}/,
                    key,
                ),
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
    };
}
