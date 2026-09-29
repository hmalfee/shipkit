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

/**
 * Stages for the email change flow.
 * This is the source of truth for both the auth SDK and any API implementing email change endpoints.
 */
export const CHANGE_EMAIL_STAGES = {
    /** Initial stage: waiting for user to confirm the change via their current email address */
    AwaitingConfirmation: 'awaiting_confirmation',
    /** Final stage: waiting for user to verify their new email address */
    AwaitingVerification: 'awaiting_verification',
} as const;

export const CHANGE_EMAIL_STAGE_VALUES = Object.values(CHANGE_EMAIL_STAGES) as [
    (typeof CHANGE_EMAIL_STAGES)[keyof typeof CHANGE_EMAIL_STAGES],
    ...(typeof CHANGE_EMAIL_STAGES)[keyof typeof CHANGE_EMAIL_STAGES][],
];

export type ChangeEmailStage =
    (typeof CHANGE_EMAIL_STAGES)[keyof typeof CHANGE_EMAIL_STAGES];
