import { type betterAuth } from 'better-auth';

export const USER_ROLES = {
    User: 'user',
    Admin: 'admin',
} as const;

export const USER_ROLE_VALUES = Object.values(USER_ROLES) as [
    (typeof USER_ROLES)[keyof typeof USER_ROLES],
    ...(typeof USER_ROLES)[keyof typeof USER_ROLES][],
];

export const OAUTH_PROVIDERS = {
    Google: 'google',
} as const satisfies Record<
    string,
    keyof NonNullable<
        ReturnType<typeof betterAuth>['options']['socialProviders']
    >
>;

export const OAUTH_PROVIDER_IDS = Object.values(OAUTH_PROVIDERS) as [
    (typeof OAUTH_PROVIDERS)[keyof typeof OAUTH_PROVIDERS],
    ...(typeof OAUTH_PROVIDERS)[keyof typeof OAUTH_PROVIDERS][],
];

export const ALLOWED_HTTP_METHODS = [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
] as const;

export const OTP_LENGTH = 6;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
export const CHANGE_EMAIL_MAX_VERIFICATION_SENDS = 3;

// @see [OAuth Popup Flow] Defines the shared callback path used by the backend for redirects and
// the frontend for mounting the popup handler.
export const OAUTH_POPUP_CALLBACK_PATH = '/auth/callback';
