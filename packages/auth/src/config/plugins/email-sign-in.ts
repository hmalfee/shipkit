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

function otpKey(email: string) {
    return `email-auth-otp:${email}`;
}

function tokenKey(token: string) {
    return `email-auth-token:${token}`;
}

// "<otp>:<token>:<attempts>" — attempts stays the LAST colon-segment (so it
// parses the same way better-auth's own splitAtLastColon does), with the
// token folded in as a middle field so verifyOtp can also invalidate the
// sibling magic-link token on success. Neither otp (digits only) nor token
// (alphanumeric) can contain a colon, so this round-trips unambiguously.
function encodeValue(otp: string, token: string, attempts: number): string {
    return `${otp}:${token}:${attempts}`;
}

function decodeValue(raw: string): {
    otp: string;
    token: string;
    attempts: number;
} {
    const lastColon = raw.lastIndexOf(':');
    const attempts = parseInt(raw.slice(lastColon + 1), 10) || 0;
    const rest = raw.slice(0, lastColon);
    const firstColon = rest.indexOf(':');
    return {
        otp: rest.slice(0, firstColon),
        token: rest.slice(firstColon + 1),
        attempts,
    };
}

type TokenValue = { email: string; callbackURL?: string; name?: string };

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
    email: string,
    disableSignUp: boolean | undefined,
    name?: string,
) {
    const existing = await ctx.context.internalAdapter.findUserByEmail(email);
    if (existing) {
        let user = existing.user;
        // BA pattern: if existing user never verified email, revoke old
        // sessions/password and mark verified now (proving email ownership).
        if (!user.emailVerified) {
            await revokeUnprovenAccountAccess(ctx, user.id);
            user = await ctx.context.internalAdapter.updateUser(user.id, {
                emailVerified: true,
            });
        }
        return user;
    }
    if (disableSignUp) return null;
    const user = await ctx.context.internalAdapter.createUser({
        email,
        name: name ?? email.split('@')[0] ?? email,
        emailVerified: true,
    });

    await ctx.context.internalAdapter.createAccount({
        userId: user.id,
        providerId: 'email-auth',
        accountId: email,
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
                    const email = ctx.body.email.toLowerCase().trim();
                    const { callbackURL, name } = ctx.body;
                    const expiresAt = new Date(
                        Date.now() + expiresInMinutes * 60_000,
                    );

                    const otp = generateRandomString(6, '0-9');
                    const token = generateRandomString(32, 'a-z', 'A-Z');

                    // OTP row carries the token so verifyOtp can invalidate it too.
                    await ctx.context.internalAdapter.createVerificationValue({
                        identifier: otpKey(email),
                        value: encodeValue(otp, token, 0),
                        expiresAt,
                    });

                    await ctx.context.internalAdapter.createVerificationValue({
                        identifier: tokenKey(token),
                        value: JSON.stringify({
                            email,
                            callbackURL,
                            name,
                        } satisfies TokenValue),
                        expiresAt,
                    });

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
                                email,
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
                    const email = ctx.body.email.toLowerCase().trim();
                    const { name } = ctx.body;
                    const key = otpKey(email);

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
                    } = decodeValue(consumed.value);

                    if (attempts >= allowedAttempts) {
                        throw new APIError('TOO_MANY_REQUESTS');
                    }

                    if (!constantTimeEqual(storedOtp, ctx.body.otp.trim())) {
                        // consume-then-rewrite gives one free retry on transient DB error;
                        // upgrade to update-in-place (findMany + updateMany, no consume) if
                        // stricter attempt enforcement is ever required.
                        await ctx.context.internalAdapter.createVerificationValue(
                            {
                                identifier: key,
                                value: encodeValue(
                                    storedOtp,
                                    token,
                                    attempts + 1,
                                ),
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
                        email,
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

                    const { id, name: userName } = user;
                    return ctx.json({ user: { id, name: userName, email } });
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

                    const user = await findOrCreateUser(
                        ctx,
                        payload.email,
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
                        .consumeVerificationValue(otpKey(payload.email))
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
