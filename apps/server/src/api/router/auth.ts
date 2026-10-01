import { handleAuthError } from '@shipkit/auth/orpc';

import { cr, os } from '../base';

export const auth = os.auth.router({
    me: cr.auth.me.handler(async ({ context }) => {
        if (!context.session) return { status: 200, body: null };
        const { id, name, displayEmail, image } = context.session.user;
        const pending = await context.auth.changeEmailStatus();
        return {
            status: 200,
            body: {
                id,
                name,
                email: displayEmail,
                image: image ?? null,
                ...(pending
                    ? {
                          changeEmailStatus: {
                              ...pending,
                          },
                      }
                    : undefined),
            },
        };
    }),

    email: os.auth.email.router({
        signIn: cr.auth.email.signIn.handler(
            async ({ context, input, errors }) => {
                const { exceeded } = await context.rateLimit({
                    limit: 3,
                    blockDuration: 60,
                });
                if (exceeded)
                    throw errors.TOO_MANY_REQUESTS({
                        message: 'Too many attempts',
                    });
                try {
                    await context.auth.signInWithEmail(input.body);
                    return { status: 200, body: undefined };
                } catch (err) {
                    handleAuthError(err, errors);
                }
            },
        ),
        verifyOtp: cr.auth.email.verifyOtp.handler(
            async ({ context, input, errors }) => {
                const { exceeded } = await context.rateLimit({
                    limit: 5,
                    blockDuration: 300,
                });
                if (exceeded)
                    throw errors.TOO_MANY_REQUESTS({
                        message: 'Too many attempts',
                    });
                try {
                    const res = await context.auth.verifyOtp(input.body);
                    return {
                        status: 200,
                        body: {
                            id: res.user.id,
                            name: res.user.name,
                            email: res.user.email,
                        },
                    };
                } catch (err) {
                    handleAuthError(err, errors);
                }
            },
        ),
        verifyMagicLink: cr.auth.email.verifyMagicLink.handler(
            async ({ context, input, errors }) => {
                const { exceeded } = await context.rateLimit({
                    limit: 10,
                    blockDuration: 60,
                });
                if (exceeded)
                    throw errors.TOO_MANY_REQUESTS({
                        message: 'Too many attempts',
                    });

                const response = await context.auth.$api('verifyMagicLink', {
                    query: {
                        token: input.query.token,
                        callbackURL: input.query.callbackURL,
                    },
                });

                const location = response.headers.get('location') ?? '/';
                return { status: 302, headers: { location } };
            },
        ),
    }),

    oauth: os.auth.oauth.router({
        signIn: cr.auth.oauth.signIn.handler(
            async ({ context, input, errors }) => {
                const { exceeded } = await context.rateLimit({
                    blockDuration: 60,
                });
                if (exceeded)
                    throw errors.TOO_MANY_REQUESTS({
                        message: 'Too many attempts',
                    });
                if (context.session)
                    throw errors.FORBIDDEN({
                        message: 'User already signed in',
                    });
                try {
                    const result = await context.auth.signInSocial({
                        provider: input.params.provider,
                        ...input.body,
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
                const { exceeded } = await context.rateLimit({ limit: 15 });
                if (exceeded)
                    throw errors.TOO_MANY_REQUESTS({
                        message: 'Too many attempts',
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
        send: cr.auth.changeEmail.send.handler(
            async ({ context, input, errors }) => {
                const { exceeded } = await context.rateLimit({
                    limit: 5,
                    blockDuration: 60 * 60,
                });
                if (exceeded)
                    throw errors.TOO_MANY_REQUESTS({
                        message: 'Too many attempts',
                    });
                if (!context.session)
                    throw errors.UNAUTHORIZED({
                        message: 'User not signed in',
                    });

                try {
                    await context.auth.requestChangeEmail({
                        newEmail: input.body.newEmail,
                        callbackURL: input.body.callbackURL,
                    });
                    return { status: 200, body: undefined };
                } catch (err) {
                    handleAuthError(err, errors);
                }
            },
        ),
        confirm: cr.auth.changeEmail.confirm.handler(
            async ({ context, input, errors }) => {
                const { exceeded } = await context.rateLimit({
                    limit: 5,
                    blockDuration: 60,
                });
                if (exceeded)
                    throw errors.TOO_MANY_REQUESTS({
                        message: 'Too many attempts',
                    });
                try {
                    const response = await context.auth.$api(
                        'confirmChangeEmail',
                        {
                            query: {
                                token: input.query.token,
                                callbackURL: input.query.callbackURL,
                            },
                        },
                    );
                    const location = response.headers.get('location') ?? '/';
                    return { status: 302, headers: { location } };
                } catch (err) {
                    handleAuthError(err, errors);
                }
            },
        ),
        verify: cr.auth.changeEmail.verify.handler(
            async ({ context, input, errors }) => {
                const { exceeded } = await context.rateLimit({
                    limit: 5,
                    blockDuration: 60,
                });
                if (exceeded)
                    throw errors.TOO_MANY_REQUESTS({
                        message: 'Too many attempts',
                    });
                try {
                    const response = await context.auth.$api(
                        'verifyChangeEmail',
                        {
                            query: {
                                token: input.query.token,
                                callbackURL: input.query.callbackURL,
                            },
                        },
                    );
                    const location = response.headers.get('location') ?? '/';
                    return { status: 302, headers: { location } };
                } catch (err) {
                    handleAuthError(err, errors);
                }
            },
        ),
        cancel: cr.auth.changeEmail.cancel.handler(
            async ({ context, errors }) => {
                if (!context.session)
                    throw errors.UNAUTHORIZED({
                        message: 'User not signed in',
                    });
                await context.auth.cancelChangeEmail();
                return { status: 200, body: undefined };
            },
        ),
    }),

    updateProfile: cr.auth.updateProfile.handler(
        async ({ context, input, errors }) => {
            const { exceeded } = await context.rateLimit({
                limit: 10,
                blockDuration: 60,
            });
            if (exceeded)
                throw errors.TOO_MANY_REQUESTS({
                    message: 'Too many attempts',
                });
            if (!context.session)
                throw errors.UNAUTHORIZED({ message: 'User not signed in' });

            try {
                await context.auth.updateUser(input.body);

                return {
                    status: 200,
                    body: undefined,
                };
            } catch (err) {
                handleAuthError(err, errors);
            }
        },
    ),
});
