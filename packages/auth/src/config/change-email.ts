import { BASE_ERROR_CODES } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';

import type { BetterAuthOptions } from 'better-auth';
import type { AuthConfig } from './types';
import type { DbHookFn } from './utils/hooks';

import { runEmailValidationPipeline } from './utils/email-validation';

/**
 * Configures better-auth's change email flow. Both the current and the new
 * email must be confirmed before the change is applied:
 *
 * 1. User requests the change; a link with a token goes to the *current* email.
 * 2. Confirming it sends a second link with a token to the *new* email.
 * 3. Verifying the new email applies the change.
 */
export function getChangeEmailConfig(
    config: AuthConfig,
): NonNullable<BetterAuthOptions['user']>['changeEmail'] {
    const { onSendChangeEmail } = config;
    if (!onSendChangeEmail) return undefined;

    return {
        enabled: true,
        // Step 1: link to the current email.
        sendChangeEmailConfirmation: async ({ user, newEmail, url, token }) =>
            onSendChangeEmail.confirmation({
                currentEmail: user.email,
                newEmail,
                token,
                callbackURL: new URL(url).searchParams.get('callbackURL') ?? '',
            }),
    };
}

function isChangeEmailVerificationToken(token: string): boolean {
    try {
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3 || !tokenParts[1]) return false;

        const payload = JSON.parse(
            Buffer.from(tokenParts[1], 'base64').toString(),
        ) as { requestType?: string };
        return payload.requestType === 'change-email-verification';
    } catch {
        return false; // Ignore parsing errors
    }
}

/**
 * Step 2: link to the new email. better-auth has no dedicated callback for
 * this and reuses its generic `sendVerificationEmail` hook, so we inspect the
 * JWT payload to detect a change-email token and forward it.
 *
 * Returns whether the verification was handled as a change-email verification.
 */
export async function sendChangeEmailVerification(
    config: AuthConfig,
    {
        user,
        url,
        token,
    }: { user: { email: string }; url: string; token: string },
): Promise<boolean> {
    if (!config.onSendChangeEmail) return false;
    if (!isChangeEmailVerificationToken(token)) return false;

    await config.onSendChangeEmail.verification({
        newEmail: user.email,
        token,
        callbackURL: new URL(url).searchParams.get('callbackURL') ?? '',
    });
    return true;
}

/**
 * Change Email Guard #1
 * This stage only validates the email change request.
 * The actual update happens in the `/verify-email` endpoint.
 *
 * Returns a path-keyed map for use with composePathBasedHooks.
 */
export function changeEmailBeforeHooks() {
    return {
        '/change-email': createAuthMiddleware(async (ctx) => {
            const raw = (ctx.body as { newEmail?: string })?.newEmail;
            if (!raw) return;
            const { sanitized, normalized } = await runEmailValidationPipeline(
                raw,
                ctx.context.internalAdapter,
            );

            // The `email` column stores the normalized address (see Guard #2).
            // Since `better-auth` internally checks for collisions using `newEmail`
            // (which we replace with the sanitized version below), we must manually
            // check against the normalized email here to prevent duplicates.
            const existing =
                await ctx.context.internalAdapter.findUserByEmail(normalized);
            if (existing) {
                throw new APIError('BAD_REQUEST', {
                    code: BASE_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL
                        .code,
                    message:
                        BASE_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL
                            .message,
                });
            }

            // Return the `sanitized` email instead of the `normalized` one.
            // This preserves the user's intended formatting (e.g., plus addressing)
            // so it can be stored in `displayEmail` during the `/verify-email` step.
            return {
                context: {
                    body: {
                        ...(ctx.body as Record<string, unknown>),
                        newEmail: sanitized,
                    },
                },
            };
        }),
    };
}

/**
 * Change Email Guard #2
 * 1. Run the full validation pipeline to get sanitized and normalized formats.
 * 2. Re-run the collision check, as the address may have been claimed
 *    between the initial request and the verification click.
 *
 * Returns a path-keyed map for use with composePathBasedDbHooks.
 */
export function changeEmailBeforeUserUpdateHooks() {
    const handler: DbHookFn<'user', 'update', 'before'> = async (
        data,
        hookCtx,
    ) => {
        if (!data.email || !hookCtx) return;

        const { sanitized, normalized } = await runEmailValidationPipeline(
            data.email,
            hookCtx.context.internalAdapter,
        );
        const existing =
            await hookCtx.context.internalAdapter.findUserByEmail(normalized);
        if (existing) {
            throw new APIError('BAD_REQUEST', {
                code: BASE_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL
                    .code,
                message:
                    BASE_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL
                        .message,
            });
        }

        // Store `normalized` as the canonical lookup key, and `sanitized` for display purposes.
        return {
            data: {
                ...data,
                email: normalized,
                displayEmail: sanitized,
            },
        };
    };
    return { '/verify-email': handler };
}
