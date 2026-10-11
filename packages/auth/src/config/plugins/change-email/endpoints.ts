import { BASE_ERROR_CODES } from 'better-auth';
import {
    APIError,
    createAuthEndpoint,
    sensitiveSessionMiddleware,
} from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { generateRandomString } from 'better-auth/crypto';
import { z } from 'zod';

import type { ChangeEmailPluginOptions } from '.';

import {
    normalizeEmail,
    runEmailValidationPipeline,
} from '../../utils/email-validation';
import { enforceResendCooldown } from '../../utils/resend-cooldown';
import {
    assertNoQuotaBlock,
    claimRequest,
    clearRequest,
    getQuotaBlock,
    recordCompletedChange,
    redeemCode,
    storeRequest,
} from './helpers';

const otpBody = (length: number) =>
    z.object({ otp: z.string().length(length).regex(/^\d+$/) });

// POST /change-email/send-confirmation — step 1: code to the CURRENT email
export function createSendChangeEmailConfirmation({
    onSendChangeEmail,
    otp: otpConfig,
}: ChangeEmailPluginOptions) {
    return createAuthEndpoint(
        '/change-email/send-confirmation',
        {
            method: 'POST',
            requireHeaders: true,
            use: [sensitiveSessionMiddleware],
        },
        async (ctx) => {
            const { user } = ctx.context.session;
            await assertNoQuotaBlock(ctx, user.id);

            await enforceResendCooldown(
                ctx,
                `change-email-resend-cooldown:${user.id}`,
                otpConfig.resendCooldownSeconds,
            );

            // Starting over invalidates any earlier code, grant and new-email code.
            await clearRequest(ctx, user.id);

            const otp = generateRandomString(otpConfig.length, '0-9');
            const email =
                (user as { displayEmail?: string }).displayEmail ?? user.email;

            await storeRequest(ctx, user.id, {
                value: {
                    phase: 'confirmation',
                    code: { otp, attempts: 0 },
                    sends: 0,
                },
                expiresAt: new Date(
                    Date.now() + otpConfig.expiresInMinutes * 60_000,
                ),
            });

            await ctx.context.runInBackgroundOrAwait(
                onSendChangeEmail({
                    stage: 'confirmation',
                    email,
                    otp,
                    expiresInMinutes: otpConfig.expiresInMinutes,
                }),
            );

            return ctx.json({ success: true });
        },
    );
}

// POST /change-email/confirm — step 2: check the confirmation code, grant access
export function createConfirmChangeEmail({
    otp: otpConfig,
}: Pick<ChangeEmailPluginOptions, 'otp'>) {
    return createAuthEndpoint(
        '/change-email/confirm',
        {
            method: 'POST',
            requireHeaders: true,
            body: otpBody(otpConfig.length),
            use: [sensitiveSessionMiddleware],
        },
        async (ctx) => {
            const { user } = ctx.context.session;

            await redeemCode(
                ctx,
                user.id,
                'confirmation',
                ctx.body.otp,
                otpConfig.allowedAttempts,
            );
            await storeRequest(ctx, user.id, {
                value: { phase: 'verification', sends: 0 },
                expiresAt: new Date(
                    Date.now() + otpConfig.expiresInMinutes * 60_000,
                ),
            });

            return ctx.json({ success: true });
        },
    );
}

// POST /change-email/send-verification — step 3: code to the NEW email
export function createSendChangeEmailVerification({
    onSendChangeEmail,
    otp: otpConfig,
    maxVerificationSends,
}: ChangeEmailPluginOptions) {
    return createAuthEndpoint(
        '/change-email/send-verification',
        {
            method: 'POST',
            requireHeaders: true,
            body: z.object({ newEmail: z.email() }),
            use: [sensitiveSessionMiddleware],
        },
        async (ctx) => {
            const { user } = ctx.context.session;

            const { sanitized, normalized } = await runEmailValidationPipeline(
                ctx.body.newEmail,
                ctx.context.internalAdapter,
            );
            // Both sides are normalized — safe comparison (user.email is always the normalized form stored in DB)
            if (normalized === user.email) {
                throw new APIError('BAD_REQUEST', {
                    message: 'New email must be different from current email',
                });
            }

            const request = await claimRequest(ctx, user.id);
            if (request.value.phase !== 'verification') {
                await storeRequest(ctx, user.id, request);
                throw new APIError('FORBIDDEN', {
                    message:
                        'Confirm the code sent to your current email first.',
                });
            }

            // Soft failure: budget is spent, store request back so last code remains valid.
            if (request.value.sends >= maxVerificationSends) {
                await storeRequest(ctx, user.id, request);
                throw new APIError('TOO_MANY_REQUESTS', {
                    message: 'Too many codes requested. Please start over.',
                });
            }

            const now = Date.now();
            const cooldownMs = otpConfig.resendCooldownSeconds * 1000;
            if (
                request.value.lastSentAt &&
                now < request.value.lastSentAt + cooldownMs
            ) {
                // Soft failure: put the request back untouched.
                await storeRequest(ctx, user.id, request);
                throw new APIError('TOO_MANY_REQUESTS', {
                    message:
                        'Please wait a few seconds before requesting another email.',
                });
            }

            const otp = generateRandomString(otpConfig.length, '0-9');
            const sends = request.value.sends + 1;

            await storeRequest(ctx, user.id, {
                value: {
                    phase: 'verification',
                    sends,
                    lastSentAt: now,
                    code: { email: sanitized, otp, attempts: 0 },
                },
                // The pending code and the row expire together.
                expiresAt: new Date(
                    Date.now() + otpConfig.expiresInMinutes * 60_000,
                ),
            });
            await ctx.context.runInBackgroundOrAwait(
                onSendChangeEmail({
                    stage: 'verification',
                    email: sanitized,
                    otp,
                    expiresInMinutes: otpConfig.expiresInMinutes,
                }),
            );

            return ctx.json({ success: true });
        },
    );
}

// POST /change-email/verify — step 4: check the verification code; applies the change.
export function createVerifyChangeEmail({
    onSendChangeEmail,
    otp: otpConfig,
}: ChangeEmailPluginOptions) {
    return createAuthEndpoint(
        '/change-email/verify',
        {
            method: 'POST',
            requireHeaders: true,
            body: otpBody(otpConfig.length),
            use: [sensitiveSessionMiddleware],
        },
        async (ctx) => {
            const { user, session } = ctx.context.session;
            await assertNoQuotaBlock(ctx, user.id);

            // Stored in its sanitized form; normalize on demand for the lookup and the write.
            const code = await redeemCode(
                ctx,
                user.id,
                'verification',
                ctx.body.otp,
                otpConfig.allowedAttempts,
            );

            // We know phase is verification so email is present.
            const sanitized = code.email!;
            const normalized = normalizeEmail(sanitized);
            // Captured BEFORE the update so the notice reaches the old address.
            const previousEmail =
                (user as { displayEmail?: string }).displayEmail ?? user.email;

            // Checked only after the code is proven, so this can't be used
            // to probe which addresses are registered.
            if (await ctx.context.internalAdapter.findUserByEmail(normalized)) {
                throw new APIError('BAD_REQUEST', {
                    code: BASE_ERROR_CODES.USER_ALREADY_EXISTS.code,
                    message:
                        'Email already exists. Please start over with a different email.',
                });
            }

            const updatedUser = await ctx.context.internalAdapter
                .updateUser(user.id, {
                    email: normalized,
                    displayEmail: sanitized,
                    emailVerified: true,
                })
                .catch(() => null);

            // Probably a concurrent registration claimed this email between the
            // duplicate check and the write.
            if (!updatedUser) {
                throw new APIError('BAD_REQUEST', {
                    code: BASE_ERROR_CODES.USER_ALREADY_EXISTS.code,
                    message:
                        'Email already exists. Please start over with a different email.',
                });
            }

            await recordCompletedChange(ctx, user.id);
            await setSessionCookie(ctx, { session, user: updatedUser });

            // Best-effort notice to the OLD address. A mail failure must not
            // fail a change that has already been applied.
            await ctx.context.runInBackgroundOrAwait(
                onSendChangeEmail({
                    stage: 'notification',
                    email: previousEmail,
                    newEmail: sanitized,
                }).catch(() => {
                    /* empty */
                }),
            );

            return ctx.json({ success: true });
        },
    );
}

// GET /change-email/status
export function createChangeEmailStatus() {
    return createAuthEndpoint(
        '/change-email/status',
        {
            method: 'GET',
            requireHeaders: true,
            use: [sensitiveSessionMiddleware],
        },
        async (ctx) => {
            const userId = ctx.context.session.user.id;
            const block = await getQuotaBlock(ctx, userId);
            return ctx.json(block ? { disallowedUntil: block.until } : null);
        },
    );
}
