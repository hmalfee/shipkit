import { oc } from '@orpc/contract';

import { rb } from '@shipkit/orpc-utils/contract';

import {
    CallbackParamsSchema,
    CallbackQuerySchema,
    OauthSignInBodySchema,
    OauthSignInParamsSchema,
    OauthSignInResponseSchema,
    SignInBodySchema,
    SignUpBodySchema,
    UserSchema,
} from '../schemas/auth';

export const auth = oc.prefix('/auth').router({
    me: rb.query('/me').responses({
        OK: UserSchema.nullable(),
    }),
    signUp: rb
        .mutation('/sign-up')
        .input({ body: SignUpBodySchema })
        .errors({
            FORBIDDEN: {},
            CONFLICT: {},
            TOO_MANY_REQUESTS: {},
        })
        .responses({
            CREATED: UserSchema,
        }),
    signIn: rb
        .mutation('/sign-in')
        .input({ body: SignInBodySchema })
        .errors({
            FORBIDDEN: {},
            UNAUTHORIZED: {},
            TOO_MANY_REQUESTS: {},
        })
        .responses({
            OK: UserSchema,
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
        .input({ params: OauthSignInParamsSchema, body: OauthSignInBodySchema })
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
