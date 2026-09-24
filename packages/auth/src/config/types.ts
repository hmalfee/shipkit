import { type redisStorage } from '@better-auth/redis-storage';

import type {
    OAUTH_PROVIDER_IDS,
    USER_ROLE_VALUES,
} from '@shipkit/shared/constants';
import type { TablesRelationalConfig } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

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
} & Record<
    (typeof OAUTH_PROVIDER_IDS)[number],
    {
        clientId: string;
        clientSecret: string;
    }
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
    onSendChangeEmail?: {
        confirmation: (payload: {
            /**
             * The user's current email address.  
             * Note: You must use this email address to send the confirmation email.
             */
            currentEmail: string;
            newEmail: string;
            token: string;
            callbackURL: string;
        }) => Promise<void>;
        verification: (payload: {
            /**
             * The user's new email address.  
             * Note: You must use this email address to send the verification email.
             */
            newEmail: string;
            token: string;
            callbackURL: string;
        }) => Promise<void>;
    };
};

export type Roles = typeof USER_ROLE_VALUES;
