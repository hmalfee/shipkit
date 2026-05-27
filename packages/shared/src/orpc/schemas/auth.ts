import z from 'zod';

import { OAUTH_PROVIDER_IDS } from '@mento-mark/shared/constants';

export const SignUpBodySchema = z.object({
    name: z.string().min(1).max(255),
    email: z.email(),
    password: z.string().min(8),
});

export const SignInBodySchema = z.object({
    email: z.email(),
    password: z.string().min(8),
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
