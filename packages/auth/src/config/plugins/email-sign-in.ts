import { BASE_ERROR_CODES } from 'better-auth';
import {
    APIError,
    createAuthEndpoint,
    formCsrfMiddleware,
    originCheck,
} from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { constantTimeEqual, generateRandomString } from 'better-auth/crypto';
import { revokeUnprovenAccountAccess } from 'better-auth/db';
import { z } from 'zod';

import type { BetterAuthPlugin, GenericEndpointContext } from 'better-auth';

import { runEmailValidationPipeline } from '../utils/email-validation';

function otpKey(normalizedEmail: string) {
    return `email-auth-otp:${normalizedEmail}`;
}

function tokenKey(token: string) {
    return `email-auth-token:${token}`;
}

type OTPValue = {
    otp: string;
    token: string;
    attempts: number;
};

type TokenValue = {
    email: string;
    callbackURL?: string;
    name?: string;
};

export type EmailSignInOptions = {
    onSendSignInEmail:
        | ((payload: {
              email: string;
              otp: string;
              magicLink: {
                  url: string;
                  token: string;
              };
              expiresInMinutes: number;
          }) => Promise<void>)
        | undefined;
    expiresInMinutes?: number;
    allowedAttempts?: number;
    disableSignUp?: boolean;
};

async function findOrCreateUser(
    ctx: GenericEndpointContext,
    // Canonical form used for lookups and as the stored `email` column.
    normalizedEmail: string,
    // User-facing form (preserves +tags, casing intent, etc.) stored in `displayEmail`.
    sanitizedEmail: string,
    disableSignUp: boolean | undefined,
    name?: string,
) {
    const existing =
        await ctx.context.internalAdapter.findUserByEmail(normalizedEmail);
    if (existing) {
        let user = existing.user;
        // BA pattern: if existing user never verified email, revoke old
        // sessions/password and mark verified now (proving email ownership).
        if (!user.emailVerified) {
            user = (await revokeUnprovenAccountAccess(ctx, user.id)) ?? user;
        }
        return user;
    }
    if (disableSignUp) return null;
    const user = await ctx.context.internalAdapter.createUser({
        email: normalizedEmail,
        displayEmail: sanitizedEmail,
        name: name ?? sanitizedEmail.split('@')[0] ?? sanitizedEmail,
        emailVerified: true,
    });

    await ctx.context.internalAdapter.createAccount({
        userId: user.id,
        providerId: 'email-auth',
        accountId: normalizedEmail,
    });

    return user;
}

export function emailSignInPlugin(opts: EmailSignInOptions) {
    const expiresInMinutes = opts.expiresInMinutes ?? 15;
    const allowedAttempts = opts.allowedAttempts ?? 3;

    return {
        id: 'email-sign-in',
        endpoints: {
            // POST /email/sign-in
            signInWithEmail: createAuthEndpoint(
                '/email/sign-in',
                {
                    method: 'POST',
                    requireHeaders: true,
                    use: [formCsrfMiddleware],
                    body: z.object({
                        email: z.email(),
                        callbackURL: z.string().optional(),
                        name: z.string().optional(),
                    }),
                },
                async (ctx) => {
                    const { sanitized, normalized } =
                        await runEmailValidationPipeline(
                            ctx.body.email,
                            ctx.context.internalAdapter,
                        );
                    const { callbackURL, name } = ctx.body;
                    const expiresAt = new Date(
                        Date.now() + expiresInMinutes * 60_000,
                    );

                    const otp = generateRandomString(6, '0-9');
                    const token = generateRandomString(32, 'a-z', 'A-Z');

                    await Promise.all([
                        ctx.context.internalAdapter.createVerificationValue({
                            // Keyed by normalized (not sanitized) so verifyOtp can find this
                            // row even if the user types the email slightly differently
                            // (e.g. "u.ser@gmail.com" vs "user@gmail.com" are the same mailbox).
                            identifier: otpKey(normalized),
                            value: JSON.stringify({
                                otp,
                                // OTP row carries the token so verifyOtp can invalidate it too.
                                token,
                                attempts: 0,
                            } satisfies OTPValue),
                            expiresAt,
                        }),
                        ctx.context.internalAdapter.createVerificationValue({
                            identifier: tokenKey(token),
                            value: JSON.stringify({
                                // Store sanitized (not normalized) to preserve the address the
                                // user originally typed, for use as displayEmail later.
                                // We only need to store it here for the magic-link flow — the
                                // click only carries back `token`, no email. The OTP flow doesn't
                                // need this, since the user resupplies their email when verifying.
                                email: sanitized,
                                callbackURL,
                                name,
                            } satisfies TokenValue),
                            expiresAt,
                        }),
                    ]);

                    const linkUrl = new URL(
                        '/auth/email/verify-magic-link',
                        ctx.context.baseURL,
                    );
                    linkUrl.searchParams.set('token', token);
                    if (callbackURL)
                        linkUrl.searchParams.set('callbackURL', callbackURL);

                    // Fire-and-forget via the platform-aware helper (handles
                    // serverless waitUntil semantics better than a bare `void`).
                    if (opts.onSendSignInEmail) {
                        await ctx.context.runInBackgroundOrAwait(
                            opts.onSendSignInEmail({
                                // Sanitized, not normalized — this goes straight to the user
                                // (as the "to" address and/or shown in the email body), so it
                                // should match what they typed, not the collapsed lookup form.
                                email: sanitized,
                                otp,
                                magicLink: { url: linkUrl.toString(), token },
                                expiresInMinutes,
                            }),
                        );
                    }

                    return ctx.json({ success: true });
                },
            ),

            // POST /email/verify-otp
            verifyOtp: createAuthEndpoint(
                '/email/verify-otp',
                {
                    method: 'POST',
                    requireHeaders: true,
                    body: z.object({
                        email: z.email(),
                        otp: z.string().regex(/^\d{6}$/),
                        name: z.string().optional(),
                    }),
                },
                async (ctx) => {
                    const { sanitized, normalized } =
                        await runEmailValidationPipeline(
                            ctx.body.email,
                            ctx.context.internalAdapter,
                        );
                    const { name } = ctx.body;
                    const key = otpKey(normalized);

                    const consumed =
                        await ctx.context.internalAdapter.consumeVerificationValue(
                            key,
                        );
                    if (!consumed) {
                        throw new APIError('BAD_REQUEST', {
                            code: BASE_ERROR_CODES.INVALID_TOKEN.code,
                            message: BASE_ERROR_CODES.INVALID_TOKEN.message,
                        });
                    }

                    const {
                        otp: storedOtp,
                        token,
                        attempts,
                    } = JSON.parse(consumed.value) as OTPValue;

                    if (attempts >= allowedAttempts) {
                        throw new APIError('TOO_MANY_REQUESTS', {
                            code: BASE_ERROR_CODES.INVALID_TOKEN.code,
                            message:
                                'Too many attempts. Please request a new OTP and try again.',
                        });
                    }

                    if (!constantTimeEqual(storedOtp, ctx.body.otp.trim())) {
                        // consume-then-rewrite gives one free retry on transient DB error;
                        // upgrade to update-in-place (findMany + updateMany, no consume) if
                        // stricter attempt enforcement is ever required.
                        await ctx.context.internalAdapter.createVerificationValue(
                            {
                                identifier: key,
                                value: JSON.stringify({
                                    otp: storedOtp,
                                    token,
                                    attempts: attempts + 1,
                                } satisfies OTPValue),
                                expiresAt: consumed.expiresAt,
                            },
                        );
                        throw new APIError('BAD_REQUEST', {
                            code: BASE_ERROR_CODES.INVALID_TOKEN.code,
                            message: BASE_ERROR_CODES.INVALID_TOKEN.message,
                        });
                    }

                    const user = await findOrCreateUser(
                        ctx,
                        normalized,
                        sanitized,
                        opts.disableSignUp,
                        name,
                    );
                    if (!user) {
                        throw new APIError(
                            opts.disableSignUp ? 'FORBIDDEN' : 'BAD_REQUEST',
                            opts.disableSignUp
                                ? {}
                                : {
                                      code: BASE_ERROR_CODES.INVALID_TOKEN.code,
                                      message:
                                          BASE_ERROR_CODES.INVALID_TOKEN
                                              .message,
                                  },
                        );
                    }

                    const session =
                        await ctx.context.internalAdapter.createSession(
                            user.id,
                        );
                    await setSessionCookie(ctx, { session, user });

                    // Kill the sibling magic-link token — best-effort.
                    await ctx.context.internalAdapter
                        .consumeVerificationValue(tokenKey(token))
                        .catch(() => null);

                    const displayEmail =
                        (user as { displayEmail?: string }).displayEmail ??
                        sanitized;

                    return ctx.json({
                        user: {
                            id: user.id,
                            name: user.name,
                            email: displayEmail,
                        },
                    });
                },
            ),

            // GET /email/verify-magic-link
            verifyMagicLink: createAuthEndpoint(
                '/email/verify-magic-link',
                {
                    method: 'GET',
                    requireHeaders: true,
                    query: z.object({
                        token: z.string().min(32),
                        callbackURL: z.string().optional(),
                    }),
                    use: [
                        originCheck(
                            (ctx) =>
                                (ctx.query as Record<string, string>)
                                    .callbackURL ?? '/',
                        ),
                    ],
                },
                async (ctx) => {
                    const { token, callbackURL } = ctx.query;
                    const key = tokenKey(token);

                    const consumed =
                        await ctx.context.internalAdapter.consumeVerificationValue(
                            key,
                        );

                    if (!consumed)
                        throw ctx.redirect(
                            `/?error=${BASE_ERROR_CODES.INVALID_TOKEN.code.toLocaleLowerCase()}`,
                        );

                    const payload = JSON.parse(consumed.value) as TokenValue;

                    const { sanitized, normalized } =
                        await runEmailValidationPipeline(
                            payload.email,
                            ctx.context.internalAdapter,
                        );

                    const user = await findOrCreateUser(
                        ctx,
                        normalized,
                        sanitized,
                        opts.disableSignUp,
                        payload.name,
                    );
                    if (!user) {
                        throw ctx.redirect(
                            opts.disableSignUp
                                ? '/?error=new_user_signup_disabled'
                                : `/?error=${BASE_ERROR_CODES.INVALID_TOKEN.code.toLocaleLowerCase()}`,
                        );
                    }

                    const session =
                        await ctx.context.internalAdapter.createSession(
                            user.id,
                        );
                    await setSessionCookie(ctx, { session, user });

                    // Kill the sibling OTP — best-effort.
                    await ctx.context.internalAdapter
                        .consumeVerificationValue(otpKey(normalized))
                        .catch(() => null);

                    throw ctx.redirect(
                        callbackURL ?? payload.callbackURL ?? '/',
                    );
                },
            ),
        },
        rateLimit: [
            {
                pathMatcher: (path) => path.startsWith('/email/'),
                window: 60,
                max: 5,
            },
        ],
    } satisfies BetterAuthPlugin;
}
