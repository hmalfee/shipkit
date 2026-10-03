import { BASE_ERROR_CODES } from 'better-auth';
import {
    APIError,
    createAuthEndpoint,
    originCheck,
    sensitiveSessionMiddleware,
} from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';

import { CHANGE_EMAIL_STAGES } from '@shipkit/shared/constants';

import type { ChangeEmailPluginOptions, PendingEmailChange } from './types';

import {
    normalizeEmail,
    runEmailValidationPipeline,
} from '../../utils/email-validation';
import {
    DEFAULT_RESEND_COOLDOWN_SECONDS,
    enforceResendCooldown,
} from '../../utils/resend-cooldown';
import {
    clearExistingRequest,
    confirmThrottleKey,
    getQuotaBlock,
    issueToken,
    pendingChangeKey,
    readPending,
    readQuota,
    recordCompletedChange,
    redirectWithError,
    resolveTokenLink,
    tokenIndexKey,
    verifyThrottleKey,
} from './helpers';

const DEFAULT_EXPIRES_IN_MINUTES = 60;

// Shared by the two email-link endpoints (confirm + verify).
const tokenLinkQuery = z.object({
    token: z.string(),
    callbackURL: z.string().optional(),
});
const callbackOriginCheck = originCheck(
    (ctx) => (ctx.query as Record<string, string>).callbackURL ?? '/',
);

// POST /change-email/request
export function createRequestChangeEmail({
    onSendChangeEmail,
    expiresInMinutes,
    resendCooldownSeconds,
}: ChangeEmailPluginOptions) {
    return createAuthEndpoint(
        '/change-email/request',
        {
            method: 'POST',
            requireHeaders: true,
            use: [sensitiveSessionMiddleware],
            body: z.object({
                newEmail: z.email(),
                callbackURL: z.string().optional(),
            }),
        },
        async (ctx) => {
            if (!onSendChangeEmail) {
                throw new APIError('BAD_REQUEST', {
                    code: BASE_ERROR_CODES.CHANGE_EMAIL_DISABLED.code,
                    message: BASE_ERROR_CODES.CHANGE_EMAIL_DISABLED.message,
                });
            }

            const currentUser = ctx.context.session.user;

            const block = getQuotaBlock(await readQuota(ctx, currentUser.id));
            if (block) {
                throw new APIError('TOO_MANY_REQUESTS', {
                    code: BASE_ERROR_CODES.EMAIL_CAN_NOT_BE_UPDATED.code,
                    message:
                        block.reason === 'LIMIT_REACHED'
                            ? 'Email change limit reached.'
                            : 'Please wait before changing your email again.',
                });
            }

            const { sanitized, normalized } = await runEmailValidationPipeline(
                ctx.body.newEmail,
                ctx.context.internalAdapter,
            );

            // Both sides are normalized — safe comparison (currentUser.email is always the normalized form stored in DB)
            if (normalized === currentUser.email) {
                throw new APIError('BAD_REQUEST', {
                    message: 'New email must be different from current email',
                });
            }

            const { resendAvailableAt } = await enforceResendCooldown(
                ctx,
                confirmThrottleKey(normalized),
                resendCooldownSeconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS,
            );

            await clearExistingRequest(ctx, currentUser.id);

            const { token, expiresAt } = await issueToken(
                ctx,
                currentUser.id,
                expiresInMinutes ?? DEFAULT_EXPIRES_IN_MINUTES,
            );

            await ctx.context.internalAdapter.createVerificationValue({
                identifier: pendingChangeKey(currentUser.id),
                value: JSON.stringify({
                    newEmail: sanitized,
                    stage: CHANGE_EMAIL_STAGES.AwaitingConfirmation,
                    token,
                } satisfies PendingEmailChange),
                expiresAt,
            });

            await ctx.context.runInBackgroundOrAwait(
                onSendChangeEmail.confirmation({
                    currentEmail: currentUser.email,
                    newEmail: sanitized,
                    token,
                    callbackURL: ctx.body.callbackURL ?? '',
                }),
            );

            return ctx.json({ success: true, resendAvailableAt });
        },
    );
}

// GET /change-email/confirm — click from the CURRENT inbox.
export function createConfirmChangeEmail({
    onSendChangeEmail,
    expiresInMinutes,
}: Omit<ChangeEmailPluginOptions, 'resendCooldownSeconds'>) {
    return createAuthEndpoint(
        '/change-email/confirm',
        {
            method: 'GET',
            requireHeaders: true,
            query: tokenLinkQuery,
            use: [callbackOriginCheck],
        },
        async (ctx) => {
            if (!onSendChangeEmail) {
                throw new APIError('BAD_REQUEST', {
                    code: BASE_ERROR_CODES.CHANGE_EMAIL_DISABLED.code,
                    message: BASE_ERROR_CODES.CHANGE_EMAIL_DISABLED.message,
                });
            }

            const { token, callbackURL } = ctx.query;
            const { userId, pending } = await resolveTokenLink(
                ctx,
                ctx.query,
                CHANGE_EMAIL_STAGES.AwaitingConfirmation,
            );

            const next = await issueToken(
                ctx,
                userId,
                expiresInMinutes ?? DEFAULT_EXPIRES_IN_MINUTES,
            );

            await Promise.all([
                ctx.context.internalAdapter.updateVerificationByIdentifier(
                    pendingChangeKey(userId),
                    {
                        value: JSON.stringify({
                            ...pending,
                            stage: CHANGE_EMAIL_STAGES.AwaitingVerification,
                            token: next.token,
                        } satisfies PendingEmailChange),
                        expiresAt: next.expiresAt,
                    },
                ),
                // Delete the now-consumed confirmation token index row
                ctx.context.internalAdapter
                    .deleteVerificationByIdentifier(tokenIndexKey(token))
                    .catch(() => null), // best-effort; orphan on failure is harmless
            ]);

            await ctx.context.runInBackgroundOrAwait(
                onSendChangeEmail.verification({
                    newEmail: pending.newEmail,
                    token: next.token,
                    callbackURL: callbackURL ?? '',
                }),
            );

            throw ctx.redirect(callbackURL ?? '/');
        },
    );
}

// GET /change-email/verify — click from the NEW inbox; applies the change.
export function createVerifyChangeEmail() {
    return createAuthEndpoint(
        '/change-email/verify',
        {
            method: 'GET',
            requireHeaders: true,
            query: tokenLinkQuery,
            use: [callbackOriginCheck],
        },
        async (ctx) => {
            const { token, callbackURL } = ctx.query;
            const { userId, pending, activeSession } = await resolveTokenLink(
                ctx,
                ctx.query,
                CHANGE_EMAIL_STAGES.AwaitingVerification,
            );

            // pending.newEmail is the sanitized form; normalize on-demand for the DB lookup and the final write
            const sanitized = pending.newEmail;
            const normalized = normalizeEmail(sanitized);

            // Late-binding duplicate check: the window between requestChangeEmail
            // and verifyChangeEmail could be minutes or hours, so we re-check just before committing.
            if (await ctx.context.internalAdapter.findUserByEmail(normalized)) {
                redirectWithError(ctx, callbackURL, 'USER_ALREADY_EXISTS');
            }

            // Every check has passed — burn the token now.
            const claimed = await ctx.context.internalAdapter
                .consumeVerificationValue(tokenIndexKey(token))
                .catch(() => null);
            if (!claimed) redirectWithError(ctx, callbackURL, 'INVALID_TOKEN');

            const updatedUser = await ctx.context.internalAdapter
                .updateUser(userId, {
                    email: normalized,
                    displayEmail: sanitized,
                    emailVerified: true,
                })
                .catch(() => null);

            // The token is spent whether or not the write succeeded, so the
            // pending row is dead either way.
            await ctx.context.internalAdapter
                .deleteVerificationByIdentifier(pendingChangeKey(userId))
                .catch(() => null);

            // Probably a concurrent registration claimed this email between the
            // duplicate check and the write.
            if (!updatedUser) {
                redirectWithError(ctx, callbackURL, 'USER_ALREADY_EXISTS');
            }

            await recordCompletedChange(ctx, userId);

            if (activeSession) {
                await setSessionCookie(ctx, {
                    session: activeSession.session,
                    user: updatedUser,
                });
            }

            throw ctx.redirect(callbackURL ?? '/');
        },
    );
}

// GET /change-email/status — non-destructive read for the settings page.
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
            const [pending, quota] = await Promise.all([
                readPending(ctx, userId),
                readQuota(ctx, userId),
            ]);

            const block = getQuotaBlock(quota);
            const disallowedUntil = block?.until;

            if (!pending)
                return ctx.json(
                    disallowedUntil != null ? { disallowedUntil } : null,
                );

            return ctx.json({
                newEmail: pending.newEmail,
                stage: pending.stage,
                ...(disallowedUntil != null && { disallowedUntil }),
            });
        },
    );
}

// POST /change-email/cancel
export function createCancelChangeEmail() {
    return createAuthEndpoint(
        '/change-email/cancel',
        {
            method: 'POST',
            requireHeaders: true,
            use: [sensitiveSessionMiddleware],
        },
        async (ctx) => {
            await clearExistingRequest(ctx, ctx.context.session.user.id);
            return ctx.json({ success: true });
        },
    );
}

// POST /change-email/resend-verification
export function createResendVerificationChangeEmail({
    onSendChangeEmail,
    resendCooldownSeconds,
}: Omit<ChangeEmailPluginOptions, 'expiresInMinutes'>) {
    return createAuthEndpoint(
        '/change-email/resend-verification',
        {
            method: 'POST',
            requireHeaders: true,
            use: [sensitiveSessionMiddleware],
            body: z.object({
                callbackURL: z.string().optional(),
            }),
        },
        async (ctx) => {
            if (!onSendChangeEmail) {
                throw new APIError('BAD_REQUEST', {
                    code: BASE_ERROR_CODES.CHANGE_EMAIL_DISABLED.code,
                    message: BASE_ERROR_CODES.CHANGE_EMAIL_DISABLED.message,
                });
            }

            const currentUser = ctx.context.session.user;
            const pending = await readPending(ctx, currentUser.id);

            if (
                !pending ||
                pending.stage !== CHANGE_EMAIL_STAGES.AwaitingVerification
            ) {
                throw new APIError('BAD_REQUEST', {
                    message: 'No pending email change awaiting verification.',
                });
            }

            const { resendAvailableAt } = await enforceResendCooldown(
                ctx,
                verifyThrottleKey(normalizeEmail(pending.newEmail)),
                resendCooldownSeconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS,
            );

            await ctx.context.runInBackgroundOrAwait(
                onSendChangeEmail.verification({
                    newEmail: pending.newEmail,
                    token: pending.token,
                    callbackURL: ctx.body.callbackURL ?? '',
                }),
            );

            return ctx.json({ resendAvailableAt });
        },
    );
}
