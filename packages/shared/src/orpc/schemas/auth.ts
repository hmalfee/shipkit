import z from 'zod';

import { OAUTH_PROVIDER_IDS } from '@shipkit/shared/constants';

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

export const UserSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
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
