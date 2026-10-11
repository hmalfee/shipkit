import { type redisStorage } from '@better-auth/redis-storage';

import type {
    OAUTH_PROVIDER_IDS,
    USER_ROLE_VALUES,
} from '@shipkit/shared/constants';
import type { TablesRelationalConfig } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { ChangeEmailPluginOptions } from './plugins/change-email';
import type { EmailSignInPluginOptions } from './plugins/email-sign-in';

export type Redis = Parameters<typeof redisStorage>[0]['client'];

export type AuthDatabase = PgDatabase<
    PgQueryResultHKT,
    Record<string, unknown>,
    TablesRelationalConfig
>;

type OAuthProvidersConfig = {
    /**
     * The template used to construct the OAuth redirect URI for each provider.
     * Must contain a `{bracketed}` placeholder (e.g. `http://localhost:3000/auth/callback/{provider}`).
     */
    redirectURITemplate: `${string}{${string}}${string}`;
    /**
     * The destination where the backend redirects the user after the provider flow (success, error, or signup).
     */
    callbackURL: string;
} & Record<
    (typeof OAUTH_PROVIDER_IDS)[number],
    {
        clientId: string;
        clientSecret: string;
    }
>;

export type OtpConfig = {
    /** Number of digits in an emailed code. */
    length: number;
    /** Minimum seconds between emailed codes for the same address/user. */
    resendCooldownSeconds: number;
    /** How long an emailed code (and magic link) stays valid. */
    expiresInMinutes: number;
    /** Wrong guesses allowed per code before it is locked. */
    allowedAttempts: number;
};

export type ChangeEmailConfig = {
    /** Max verification emails per change-email request (first send included). */
    maxVerificationSends: number;
};

export type AuthConfig = {
    secret: string;
    useSecureCookies: boolean;
    /** Overrides for emailed-code behavior. Omitted keys fall back to `DEFAULT_OTP_CONFIG`. */
    otp?: Partial<OtpConfig>;
    /** Overrides for the change-email flow. Omitted keys fall back to `DEFAULT_CHANGE_EMAIL_CONFIG`. */
    changeEmail?: Partial<ChangeEmailConfig>;
    /**
     * Root domain for cross-subdomain cookie sharing. Use the most specific scope
     * needed to avoid exposing session cookies to untrusted subdomains. Omit if
     * all services share the same origin.
     */
    cookieDomain?: string;
    oauth: OAuthProvidersConfig;
    onSendSignInEmail: EmailSignInPluginOptions['onSendSignInEmail'];
    onSendChangeEmail: ChangeEmailPluginOptions['onSendChangeEmail'];
};

export type Roles = typeof USER_ROLE_VALUES;
