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
