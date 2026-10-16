import { handleAuthError } from '@shipkit/auth/orpc';

import { cr, os } from '../base';

// Route-wide ceiling on emails sent by each route. Per-IP and per-address
// limits don't stop a botnet that rotates both. Tune to peak legitimate volume.
const EMAIL_SEND_GLOBAL = { limit: 500, window: 3600 };

export const auth = os.auth.router({
    me: cr.auth.me.handler(async ({ context }) => {
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
    }),
    email: os.auth.email.router({
        signIn: cr.auth.email.signIn.handler(
            async ({ context, input, errors }) => {
                await context.rateLimit({
                    tier: 'MODERATE',
                    by: { email: input.body.email },
                    global: EMAIL_SEND_GLOBAL,
                    error: errors.TOO_MANY_REQUESTS({
                        message: 'Too many attempts',
                    }),
                });

                try {
                    await context.auth.signInWithEmail(input.body);
                    return { status: 200 };
                } catch (err) {
                    handleAuthError(err, errors);
                }
            },
        ),
        verify: os.auth.email.verify.router({
            otp: cr.auth.email.verify.otp.handler(
                async ({ context, input, errors }) => {
                    await context.rateLimit({
                        tier: 'MODERATE',
                        by: { email: input.body.email },
                        escalate: true,
                        error: errors.TOO_MANY_REQUESTS({
                            message: 'Too many attempts',
                        }),
                    });

                    try {
                        await context.auth.verifyOtp(input.body);
                        return { status: 200 };
                    } catch (err) {
                        handleAuthError(err, errors);
                    }
                },
            ),
            magicLink: cr.auth.email.verify.magicLink.handler(
                async ({ context, input, errors }) => {
                    await context.rateLimit({
                        tier: 'RELAXED',
                        error: errors.TOO_MANY_REQUESTS({
                            message: 'Too many attempts',
                        }),
                    });

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
                },
            ),
        }),
    }),
    oauth: os.auth.oauth.router({
        signIn: cr.auth.oauth.signIn.handler(
            async ({ context, input, errors }) => {
                await context.rateLimit({
                    tier: 'RELAXED',
                    error: errors.TOO_MANY_REQUESTS({
                        message: 'Too many attempts',
                    }),
                });

                if (context.session)
                    throw errors.FORBIDDEN({
                        message: 'User already signed in',
                    });
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
            },
        ),
        callback: cr.auth.oauth.callback.handler(
            async ({ context, input, errors }) => {
                await context.rateLimit({
                    tier: 'RELAXED',
                    error: errors.TOO_MANY_REQUESTS({
                        message: 'Too many attempts',
                    }),
                });

                if (context.session)
                    throw errors.FORBIDDEN({
                        message: 'User already signed in',
                    });
                const response = await context.auth.$api('callbackOAuth', {
                    query: input.query,
                    params: { id: input.params.provider },
                });
                const location = response.headers.get('location') ?? '/';
                return { status: 302, headers: { location } };
            },
        ),
    }),
    signOut: cr.auth.signOut.handler(async ({ context, errors }) => {
        if (!context.session)
            throw errors.UNAUTHORIZED({ message: 'User not signed in' });
        try {
            await context.auth.signOut();
            return { status: 204 };
        } catch (err) {
            handleAuthError(err, errors);
        }
    }),
    changeEmail: os.auth.changeEmail.router({
        confirmation: os.auth.changeEmail.confirmation.router({
            send: cr.auth.changeEmail.confirmation.send.handler(
                async ({ context, errors }) => {
                    await context.rateLimit({
                        tier: 'STRICT',
                        global: EMAIL_SEND_GLOBAL,
                        error: errors.TOO_MANY_REQUESTS({
                            message: 'Too many attempts',
                        }),
                    });

                    if (!context.session)
                        throw errors.UNAUTHORIZED({
                            message: 'User not signed in',
                        });
                    try {
                        await context.auth.sendChangeEmailConfirmation();
                        return { status: 200 };
                    } catch (err) {
                        handleAuthError(err, errors);
                    }
                },
            ),
            submit: cr.auth.changeEmail.confirmation.submit.handler(
                async ({ context, input, errors }) => {
                    await context.rateLimit({
                        tier: 'MODERATE',
                        escalate: true,
                        error: errors.TOO_MANY_REQUESTS({
                            message: 'Too many attempts',
                        }),
                    });

                    if (!context.session)
                        throw errors.UNAUTHORIZED({
                            message: 'User not signed in',
                        });
                    try {
                        await context.auth.confirmChangeEmail({
                            otp: input.body.otp,
                        });
                        return { status: 200 };
                    } catch (err) {
                        handleAuthError(err, errors);
                    }
                },
            ),
        }),
        verification: os.auth.changeEmail.verification.router({
            send: cr.auth.changeEmail.verification.send.handler(
                async ({ context, input, errors }) => {
                    await context.rateLimit({
                        tier: 'STRICT',
                        by: { email: input.body.newEmail },
                        global: EMAIL_SEND_GLOBAL,
                        error: errors.TOO_MANY_REQUESTS({
                            message: 'Too many attempts',
                        }),
                    });

                    if (!context.session)
                        throw errors.UNAUTHORIZED({
                            message: 'User not signed in',
                        });
                    try {
                        await context.auth.sendChangeEmailVerification({
                            newEmail: input.body.newEmail,
                        });
                        return { status: 200 };
                    } catch (err) {
                        handleAuthError(err, errors);
                    }
                },
            ),
            submit: cr.auth.changeEmail.verification.submit.handler(
                async ({ context, input, errors }) => {
                    await context.rateLimit({
                        tier: 'MODERATE',
                        escalate: true,
                        error: errors.TOO_MANY_REQUESTS({
                            message: 'Too many attempts',
                        }),
                    });

                    if (!context.session)
                        throw errors.UNAUTHORIZED({
                            message: 'User not signed in',
                        });
                    try {
                        await context.auth.verifyChangeEmail({
                            otp: input.body.otp,
                        });
                        return { status: 200 };
                    } catch (err) {
                        handleAuthError(err, errors);
                    }
                },
            ),
        }),
    }),
    updateProfile: cr.auth.updateProfile.handler(
        async ({ context, input, errors }) => {
            await context.rateLimit({
                tier: 'STANDARD',
                error: errors.TOO_MANY_REQUESTS({
                    message: 'Too many attempts',
                }),
            });

            if (!context.session)
                throw errors.UNAUTHORIZED({ message: 'User not signed in' });
            try {
                await context.auth.updateUser(input.body);
                return { status: 200 };
            } catch (err) {
                handleAuthError(err, errors);
            }
        },
    ),
});
