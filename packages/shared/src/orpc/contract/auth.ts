import { oc } from '@orpc/contract';

import { rb } from '@shipkit/orpc-utils/contract';

import {
    CallbackParamsSchema,
    CallbackQuerySchema,
    ChangeEmailBodySchema,
    ChangeEmailVerifyQuerySchema,
    EmailSignInBodySchema,
    OauthSignInBodySchema,
    OauthSignInParamsSchema,
    OauthSignInResponseSchema,
    UpdateProfileBodySchema,
    UserSchema,
    VerifyMagicLinkQuerySchema,
    VerifyOtpBodySchema,
} from '../schemas/auth';

export const auth = oc.prefix('/auth').router({
    me: rb.query('/me').responses({ OK: UserSchema.nullable() }),

    email: oc.prefix('/email').router({
        signIn: rb
            .mutation('/sign-in')
            .input({
                body: EmailSignInBodySchema,
            })
            .errors({
                TOO_MANY_REQUESTS: {},
            })
            .responses({
                OK: undefined,
            }),
        verifyOtp: rb
            .mutation('/verify-otp')
            .input({
                body: VerifyOtpBodySchema,
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
                query: VerifyMagicLinkQuerySchema,
            })
            .errors({
                FORBIDDEN: {},
                TOO_MANY_REQUESTS: {},
            })
            .responses({
                FOUND: undefined,
            }),
    }),

    oauth: oc.prefix('/oauth').router({
        signIn: rb
            .mutation('/sign-in/{provider}')
            .input({
                params: OauthSignInParamsSchema,
                body: OauthSignInBodySchema,
            })
            .errors({
                FORBIDDEN: {},
                TOO_MANY_REQUESTS: {},
            })
            .responses({
                OK: OauthSignInResponseSchema,
            }),
        callback: rb
            .query('/callback/{provider}')
            .input({
                params: CallbackParamsSchema,
                query: CallbackQuerySchema,
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

    changeEmail: oc.router({
        send: rb
            .mutation('/change-email')
            .input({
                body: ChangeEmailBodySchema,
            })
            .errors({
                UNAUTHORIZED: {},
                TOO_MANY_REQUESTS: {},
            })
            .responses({
                OK: undefined,
            }),
        verify: rb
            .query('/change-email/verify')
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
    }),

    updateProfile: rb
        .mutation('/profile')
        .input({
            body: UpdateProfileBodySchema,
        })
        .errors({
            UNAUTHORIZED: {},
            TOO_MANY_REQUESTS: {},
        })
        .responses({
            OK: undefined,
        }),
});
