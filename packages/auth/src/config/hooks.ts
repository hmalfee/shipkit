import { BASE_ERROR_CODES } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';

import type { BetterAuthOptions, GenericEndpointContext } from 'better-auth';

import { runEmailValidationPipeline } from './utils/email-validation';

export const hooks: BetterAuthOptions['hooks'] = {
    before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/change-email') return;
        // Change Email Guard #1
        // This stage only validates the email change request.
        // The actual update happens in the `/verify-email` endpoint.

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

export const databaseHooks: BetterAuthOptions['databaseHooks'] = {
    user: {
        update: {
            before: async (
                data: Partial<{ email: string }> & Record<string, unknown>,
                hookCtx: GenericEndpointContext | null,
            ) => {
                if (hookCtx?.path !== '/verify-email') return;
                // Change Email Guard #2
                // 1. Run the full validation pipeline to get sanitized and normalized formats.
                // 2. Re-run the collision check, as the address may have been claimed
                //    between the initial request and the verification click.

                if (!data.email) return;

                const { sanitized, normalized } =
                    await runEmailValidationPipeline(
                        data.email,
                        hookCtx.context.internalAdapter,
                    );
                const existing =
                    await hookCtx.context.internalAdapter.findUserByEmail(
                        normalized,
                    );
                if (existing) {
                    throw new APIError('BAD_REQUEST', {
                        code: BASE_ERROR_CODES
                            .USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL.code,
                        message:
                            BASE_ERROR_CODES
                                .USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL.message,
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
            },
        },
    },
};
