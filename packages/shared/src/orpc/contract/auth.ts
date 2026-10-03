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
    ResendVerificationBodySchema,
    SendThrottleSchema,
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
                OK: SendThrottleSchema,
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

    changeEmail: oc.prefix('/change-email').router({
        request: rb
            .mutation('/')
            .input({
                body: ChangeEmailBodySchema,
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
                body: ResendVerificationBodySchema,
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
