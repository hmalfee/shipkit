import z from 'zod';

import {
    CHANGE_EMAIL_STAGE_VALUES,
    OAUTH_PROVIDER_IDS,
} from '@shipkit/shared/constants';

export const EmailSignInBodySchema = z.object({
    email: z.email(),
    callbackURL: z.string().optional(),
});

export const VerifyOtpBodySchema = z.object({
    email: z.email(),
    otp: z.string().regex(/^\d{6}$/),
});

export const VerifyMagicLinkQuerySchema = z.object({
    token: z.string().min(32),
    callbackURL: z.string().optional(),
});

const ChangeEmailStatusSchema = z.union([
    z.object({
        newEmail: z.email(),
        stage: z.enum(CHANGE_EMAIL_STAGE_VALUES),
        disallowedUntil: z.number().optional(),
    }),
    z.object({
        disallowedUntil: z.number(),
        newEmail: z.never().optional(),
        stage: z.never().optional(),
    }),
]);

export const UserSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    image: z.url().nullable(),
    changeEmailStatus: ChangeEmailStatusSchema.optional(),
});

export const UpdateProfileBodySchema = z.object({
    // `name` is the only updatable field for now, so it's required (otherwise
    // an empty body would be a no-op).
    // TODO: When more fields are added, replace this with a `z.union()` of
    // single-field schemas so partial updates are allowed and the inferred
    // type guarantees at least one field is present (`.refine()` wouldn't).
    name: z.string().min(1).max(255),
});

export const ChangeEmailBodySchema = z.object({
    newEmail: z.email(),
    callbackURL: z.string().optional(),
});

export const ChangeEmailVerifyQuerySchema = z.object({
    token: z.string().min(32),
    callbackURL: z.string().optional(),
});

export const OauthSignInParamsSchema = z.object({
    provider: z.enum(OAUTH_PROVIDER_IDS),
});

export const OauthSignInBodySchema = z.object({
    callbackURL: z.string().optional(),
});

export const OauthSignInResponseSchema = z.object({
    url: z.string(),
    redirect: z.boolean(),
});

export const CallbackParamsSchema = z.object({
    provider: z.enum(OAUTH_PROVIDER_IDS),
});

export const CallbackQuerySchema = z.looseObject({
    code: z.string().optional(),
    state: z.string().optional(),
    error: z.string().optional(),
    error_description: z.string().optional(),
});
