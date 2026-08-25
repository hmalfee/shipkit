import { oc } from '@orpc/contract';

import { rb } from '@shipkit/orpc-utils/contract';

import {
    CallbackParamsSchema,
    CallbackQuerySchema,
    EmailSignInBodySchema,
    OauthSignInBodySchema,
    OauthSignInParamsSchema,
    OauthSignInResponseSchema,
    UserSchema,
    VerifyMagicLinkQuerySchema,
    VerifyOtpBodySchema,
} from '../schemas/auth';

export const auth = oc.prefix('/auth').router({
    me: rb.query('/me').responses({ OK: UserSchema.nullable() }),
    email: oc.router({
        signIn: rb
            .mutation('/email/sign-in')
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
            .mutation('/email/verify-otp')
            .input({
                body: VerifyOtpBodySchema,
            })
            .errors({
                UNAUTHORIZED: {},
                TOO_MANY_REQUESTS: {},
                FORBIDDEN: {},
            })
            .responses({
                OK: UserSchema,
            }),
        verifyMagicLink: rb
            .query('/email/verify-magic-link')
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
    signOut: rb
        .mutation('/sign-out')
        .errors({
            UNAUTHORIZED: {},
        })
        .responses({
            NO_CONTENT: undefined,
        }),
    oauthSignIn: rb
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
    oauthCallback: rb
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
});
