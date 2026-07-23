import { handleAuthError } from '@shipkit/auth/orpc';

import { env } from '@/env';

import { cr, os } from '../base';

export const auth = os.auth.router({
    me: cr.auth.me.handler(async ({ context }) => {
        if (!context.session) {
            return { status: 200, body: null };
        }

        const { id, name, email } = context.session.user;
        return { status: 200, body: { id, name, email } };
    }),

    signUp: cr.auth.signUp.handler(async ({ context, input, errors }) => {
        const { exceeded } = await context.rateLimit({ blockDuration: 60 });

        if (exceeded) {
            throw errors.TOO_MANY_REQUESTS({
                message: 'Too many sign up attempts. Please try again later.',
            });
        }
        if (context.session) {
            throw errors.FORBIDDEN({ message: 'Already signed in' });
        }

        try {
            const res = await context.auth.signUpEmail(input.body);

            return {
                status: 201,
                body: {
                    id: res.user.id,
                    name: res.user.name,
                    email: res.user.email,
                },
            };
        } catch (err) {
            handleAuthError(err, errors);
        }
    }),

    signIn: cr.auth.signIn.handler(async ({ context, input, errors }) => {
        const { exceeded } = await context.rateLimit({
            limit: 5,
            blockDuration: 300,
        });

        if (exceeded) {
            throw errors.TOO_MANY_REQUESTS({
                message: 'Too many sign in attempts. Please try again later.',
            });
        }

        if (context.session) {
            throw errors.FORBIDDEN({ message: 'Already signed in' });
        }

        try {
            const res = await context.auth.signInEmail(input.body);

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
    }),

    signOut: cr.auth.signOut.handler(async ({ context, errors }) => {
        if (!context.session) {
            throw errors.UNAUTHORIZED({ message: 'You must be logged in' });
        }

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

            if (exceeded) {
                throw errors.TOO_MANY_REQUESTS({
                    message:
                        'Too many sign in attempts. Please try again later.',
                });
            }
            if (context.session) {
                throw errors.FORBIDDEN({ message: 'Already signed in' });
            }

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

            if (exceeded) {
                throw errors.TOO_MANY_REQUESTS({
                    message:
                        'Too many sign in attempts. Please try again later.',
                });
            }

            // Reconstruct the full callback URL that better-auth expects
            const url = new URL(
                `/auth/callback/${input.params.provider}`,
                env.SERVER_URL,
            );

            // Forward all query params (code, state, error, etc.)
            for (const [key, value] of Object.entries(input.query)) {
                if (value !== undefined) {
                    url.searchParams.set(
                        key,
                        typeof value === 'object'
                            ? JSON.stringify(value)
                            : String(value as string),
                    );
                }
            }

            // Build a synthetic Request for better-auth handler
            const request = new Request(url, {
                method: 'GET',
                headers: context.reqHeaders,
            });

            // Passthrough — cookies forwarded via responseCookies plugin
            const response = await context.auth.$passthrough(request);
            const location = response.headers.get('location') ?? '/';

            return { status: 302, headers: { location } };
        },
    ),
});
