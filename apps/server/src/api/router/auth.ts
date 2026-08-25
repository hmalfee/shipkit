import { handleAuthError } from '@shipkit/auth/orpc';

import { env } from '@/env';

import { cr, os } from '../base';

export const auth = os.auth.router({
    me: cr.auth.me.handler(async ({ context }) => {
        if (!context.session) return { status: 200, body: null };
        const { id, name, email } = context.session.user;
        return { status: 200, body: { id, name, email } };
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

                const url = new URL(
                    '/auth/email/verify-magic-link',
                    env.SERVER_URL,
                );
                url.searchParams.set('token', input.query.token);
                if (input.query.callbackURL)
                    url.searchParams.set(
                        'callbackURL',
                        input.query.callbackURL,
                    );

                const request = new Request(url, {
                    method: 'GET',
                    headers: context.reqHeaders,
                });
                const response = await context.auth.$passthrough(request);
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

    oauthSignIn: cr.auth.oauthSignIn.handler(
        async ({ context, input, errors }) => {
            const { exceeded } = await context.rateLimit({ blockDuration: 60 });
            if (exceeded)
                throw errors.TOO_MANY_REQUESTS({
                    message: 'Too many attempts',
                });
            if (context.session)
                throw errors.FORBIDDEN({ message: 'User already signed in' });
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

    oauthCallback: cr.auth.oauthCallback.handler(
        async ({ context, input, errors }) => {
            const { exceeded } = await context.rateLimit({ limit: 15 });
            if (exceeded)
                throw errors.TOO_MANY_REQUESTS({
                    message: 'Too many attempts',
                });
            if (context.session)
                throw errors.FORBIDDEN({ message: 'User already signed in' });

            const url = new URL(
                `/auth/callback/${input.params.provider}`,
                env.SERVER_URL,
            );
            for (const [key, value] of Object.entries(input.query)) {
                if (value !== undefined)
                    url.searchParams.set(key, String(value as string));
            }
            const request = new Request(url, {
                method: 'GET',
                headers: context.reqHeaders,
            });
            const response = await context.auth.$passthrough(request);
            const location = response.headers.get('location') ?? '/';
            return { status: 302, headers: { location } };
        },
    ),
});
