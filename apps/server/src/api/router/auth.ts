import { handleAuthError } from '@shipkit/auth/orpc';

import { authed, defineRouter, guest, rateLimited } from '../base';

// Route-wide ceiling on emails sent by each route. Per-IP and per-address
// limits don't stop a botnet that rotates both. Tune to peak legitimate volume.
const EMAIL_SEND_GLOBAL = { limit: 500, window: 3600 };

export const auth = defineRouter.auth({
    me: async ({ context }) => {
        if (!context.session) return { status: 200, body: null };
        const { id, name, displayEmail, image, roles } = context.session.user;
        const status = await context.auth.changeEmailStatus();
        return {
            status: 200,
            body: {
                id,
                name,
                email: displayEmail,
                image: image ?? null,
                ...(roles.includes('admin') ? { isAdmin: true } : undefined),
                ...(status ? { changeEmailStatus: status } : undefined),
            },
        };
    },
    email: {
        signIn: rateLimited(
            {
                tier: 'MODERATE',
                by: (i) => ({ email: i.body.email }),
                global: EMAIL_SEND_GLOBAL,
            },
            guest(async ({ context, input, errors }) => {
                try {
                    await context.auth.signInWithEmail(input.body);
                    return { status: 200 };
                } catch (err) {
                    handleAuthError(err, errors);
                }
            }),
        ),
        verify: {
            otp: rateLimited(
                {
                    tier: 'MODERATE',
                    by: (i) => ({ email: i.body.email }),
                    escalate: true,
                },
                guest(async ({ context, input, errors }) => {
                    try {
                        await context.auth.verifyOtp(input.body);
                        return { status: 200 };
                    } catch (err) {
                        handleAuthError(err, errors);
                    }
                }),
            ),
            magicLink: rateLimited(
                { tier: 'RELAXED' },
                guest(async ({ context, input }) => {
                    const response = await context.auth.$api(
                        'verifyMagicLink',
                        {
                            query: {
                                token: input.query.token,
                                callbackURL: input.query.callbackURL,
                            },
                        },
                    );
                    const location = response.headers.get('location') ?? '/';
                    return { status: 302, headers: { location } };
                }),
            ),
        },
    },
    oauth: {
        signIn: rateLimited(
            { tier: 'RELAXED' },
            guest(async ({ context, input, errors }) => {
                try {
                    const result = await context.auth.signInSocial({
                        provider: input.params.provider,
                    });
                    return {
                        status: 200,
                        body: {
                            url: result.url ?? '',
                            redirect: result.redirect ?? false,
                        },
                    };
                } catch (err) {
                    handleAuthError(err, errors);
                }
            }),
        ),
        callback: rateLimited(
            { tier: 'RELAXED' },
            guest(async ({ context, input }) => {
                const response = await context.auth.$api('callbackOAuth', {
                    query: input.query,
                    params: { id: input.params.provider },
                });
                const location = response.headers.get('location') ?? '/';
                return { status: 302, headers: { location } };
            }),
        ),
    },
    signOut: authed(async ({ context, errors }) => {
        try {
            await context.auth.signOut();
            return { status: 204 };
        } catch (err) {
            handleAuthError(err, errors);
        }
    }),
    changeEmail: {
        confirmation: {
            send: rateLimited(
                { tier: 'STRICT', global: EMAIL_SEND_GLOBAL },
                authed(async ({ context, errors }) => {
                    try {
                        await context.auth.sendChangeEmailConfirmation();
                        return { status: 200 };
                    } catch (err) {
                        handleAuthError(err, errors);
                    }
                }),
            ),
            submit: rateLimited(
                { tier: 'MODERATE', escalate: true },
                authed(async ({ context, input, errors }) => {
                    try {
                        await context.auth.confirmChangeEmail({
                            otp: input.body.otp,
                        });
                        return { status: 200 };
                    } catch (err) {
                        handleAuthError(err, errors);
                    }
                }),
            ),
        },
        verification: {
            send: rateLimited(
                {
                    tier: 'STRICT',
                    by: (i) => ({ email: i.body.newEmail }),
                    global: EMAIL_SEND_GLOBAL,
                },
                authed(async ({ context, input, errors }) => {
                    try {
                        await context.auth.sendChangeEmailVerification({
                            newEmail: input.body.newEmail,
                        });
                        return { status: 200 };
                    } catch (err) {
                        handleAuthError(err, errors);
                    }
                }),
            ),
            submit: rateLimited(
                { tier: 'MODERATE', escalate: true },
                authed(async ({ context, input, errors }) => {
                    try {
                        await context.auth.verifyChangeEmail({
                            otp: input.body.otp,
                        });
                        return { status: 200 };
                    } catch (err) {
                        handleAuthError(err, errors);
                    }
                }),
            ),
        },
    },
    updateProfile: rateLimited(
        { tier: 'STANDARD' },
        authed(async ({ context, input, errors }) => {
            try {
                await context.auth.updateUser(input.body);
                return { status: 200 };
            } catch (err) {
                handleAuthError(err, errors);
            }
        }),
    ),
});
