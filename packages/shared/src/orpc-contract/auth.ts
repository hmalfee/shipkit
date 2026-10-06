import z from 'zod';

import { group, rb } from '@shipkit/orpc-utils/contract';
import {
    CHANGE_EMAIL_STAGE_VALUES,
    OAUTH_PROVIDER_IDS,
} from '@shipkit/shared/constants';

const UserSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    image: z.url().nullable(),
    isAdmin: z.boolean().optional(),
    changeEmailStatus: z
        .union([
            z.object({
                newEmail: z.email(),
                stage: z.enum(CHANGE_EMAIL_STAGE_VALUES),
                disallowedUntil: z.number().optional(),
            }),
            z.object({
                disallowedUntil: z.number(),
                newEmail: z.never().optional(),
                stage: z.never().optional(),
            }),
        ])
        .optional(),
});

const SendThrottleSchema = z.object({
    resendAvailableAt: z.number(), // ms timestamp
});

const ChangeEmailVerifyQuerySchema = z.object({
    token: z.string().min(32),
    callbackURL: z.string().optional(),
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
                OK: SendThrottleSchema,
            }),
        verifyOtp: rb
            .mutation('/verify-otp')
            .input({
                body: z.object({
                    email: z.email(),
                    otp: z.string().regex(/^\d{6}$/),
                }),
            })
            .errors({
                UNAUTHORIZED: {},
                TOO_MANY_REQUESTS: {},
                FORBIDDEN: {},
            })
            .responses({
                OK: UserSchema.omit({ image: true }),
            }),
        verifyMagicLink: rb
            .query('/verify-magic-link')
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
        request: rb
            .mutation('/')
            .input({
                body: z.object({
                    newEmail: z.email(),
                    callbackURL: z.string().optional(),
                }),
            })
            .errors({
                UNAUTHORIZED: {},
                TOO_MANY_REQUESTS: {},
            })
            .responses({
                OK: SendThrottleSchema,
            }),
        confirm: rb
            .query('/confirm')
            .input({
                query: ChangeEmailVerifyQuerySchema,
            })
            .errors({
                TOO_MANY_REQUESTS: {},
                UNAUTHORIZED: {},
            })
            .responses({
                FOUND: undefined,
            }),
        verify: rb
            .query('/verify')
            .input({
                query: ChangeEmailVerifyQuerySchema,
            })
            .errors({
                TOO_MANY_REQUESTS: {},
                UNAUTHORIZED: {},
            })
            .responses({
                FOUND: undefined,
            }),
        cancel: rb
            .mutation('/cancel')
            .errors({
                UNAUTHORIZED: {},
            })
            .responses({
                OK: undefined,
            }),
        resendVerification: rb
            .mutation('/resend-verification')
            .input({
                body: z.object({
                    callbackURL: z.string().optional(),
                }),
            })
            .errors({
                UNAUTHORIZED: {},
                TOO_MANY_REQUESTS: {},
            })
            .responses({
                OK: SendThrottleSchema,
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
