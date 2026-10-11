import z from 'zod';

import { group, rb } from '@shipkit/orpc-utils/contract';
import { OAUTH_PROVIDER_IDS, OTP_LENGTH } from '@shipkit/shared/constants';

const UserSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    image: z.url().nullable(),
    isAdmin: z.boolean().optional(),
    changeEmailStatus: z
        .object({
            disallowedUntil: z.number(), // ms timestamp
        })
        .optional(),
});

const OtpBodySchema = z.object({
    otp: z.string().length(OTP_LENGTH).regex(/^\d+$/),
});

const OauthProviderParamsSchema = z.object({
    provider: z.enum(OAUTH_PROVIDER_IDS),
});

export const auth = group('/auth', {
    me: rb.query('/me').responses({ OK: UserSchema.nullable() }),
    email: group('/email', {
        signIn: rb
            .mutation('/sign-in')
            .input({
                body: z.object({
                    email: z.email(),
                    callbackURL: z.string().optional(),
                }),
            })
            .errors({
                TOO_MANY_REQUESTS: {},
            })
            .responses({
                OK: undefined,
            }),
        verify: group('/verify', {
            otp: rb
                .mutation('/otp')
                .input({
                    body: OtpBodySchema.extend({ email: z.email() }),
                })
                .errors({
                    UNAUTHORIZED: {},
                    TOO_MANY_REQUESTS: {},
                    FORBIDDEN: {},
                })
                .responses({
                    OK: UserSchema.omit({ image: true }),
                }),
            magicLink: rb
                .query('/magic-link')
                .input({
                    query: z.object({
                        token: z.string().min(32),
                        callbackURL: z.string().optional(),
                    }),
                })
                .errors({
                    FORBIDDEN: {},
                    TOO_MANY_REQUESTS: {},
                })
                .responses({
                    FOUND: undefined,
                }),
        }),
    }),
    oauth: group('/oauth', {
        signIn: rb
            .mutation('/sign-in/{provider}')
            .input({
                params: OauthProviderParamsSchema,
            })
            .errors({
                FORBIDDEN: {},
                TOO_MANY_REQUESTS: {},
            })
            .responses({
                OK: z.object({
                    url: z.string(),
                    redirect: z.boolean(),
                }),
            }),
        callback: rb
            .query('/callback/{provider}')
            .input({
                params: OauthProviderParamsSchema,
                query: z.looseObject({
                    code: z.string().optional(),
                    state: z.string().optional(),
                    error: z.string().optional(),
                    error_description: z.string().optional(),
                }),
            })
            .errors({
                FORBIDDEN: {},
                TOO_MANY_REQUESTS: {},
            })
            .responses({
                FOUND: undefined,
            }),
    }),
    signOut: rb
        .mutation('/sign-out')
        .errors({
            UNAUTHORIZED: {},
        })
        .responses({
            NO_CONTENT: undefined,
        }),
    changeEmail: group('/change-email', {
        confirmation: group('/confirmation', {
            send: rb
                .mutation('/')
                .errors({ UNAUTHORIZED: {}, TOO_MANY_REQUESTS: {} })
                .responses({ OK: undefined }),
            submit: rb
                .mutation('/', 'PUT')
                .input({ body: OtpBodySchema })
                .errors({ UNAUTHORIZED: {}, TOO_MANY_REQUESTS: {} })
                .responses({ OK: undefined }),
        }),
        verification: group('/verification', {
            send: rb
                .mutation('/')
                .input({ body: z.object({ newEmail: z.email() }) })
                .errors({
                    UNAUTHORIZED: {},
                    FORBIDDEN: {},
                    TOO_MANY_REQUESTS: {},
                })
                .responses({ OK: undefined }),
            submit: rb
                .mutation('/', 'PUT')
                .input({ body: OtpBodySchema })
                .errors({
                    UNAUTHORIZED: {},
                    FORBIDDEN: {},
                    TOO_MANY_REQUESTS: {},
                })
                .responses({ OK: undefined }),
        }),
    }),
    updateProfile: rb
        .mutation('/profile')
        .input({
            body: z.object({
                // `name` is the only updatable field for now, so it's required
                // (otherwise an empty body would be a no-op).
                // TODO: When more fields are added, replace this with a
                // `z.union()` of single-field schemas so partial updates are
                // allowed and the inferred type guarantees at least one field
                // is present (`.refine()` wouldn't).
                name: z.string().min(1).max(255),
            }),
        })
        .errors({
            UNAUTHORIZED: {},
            TOO_MANY_REQUESTS: {},
        })
        .responses({
            OK: undefined,
        }),
});
