import type { BetterAuthPlugin } from 'better-auth';
import type { ChangeEmailPluginOptions } from './types';

import {
    createCancelChangeEmail,
    createChangeEmailStatus,
    createConfirmChangeEmail,
    createRequestChangeEmail,
    createResendVerificationChangeEmail,
    createVerifyChangeEmail,
} from './endpoints';

export type { ChangeEmailPluginOptions } from './types';

export function changeEmailPlugin(opts: ChangeEmailPluginOptions) {
    return {
        id: 'change-email',
        endpoints: {
            requestChangeEmail: createRequestChangeEmail(opts),
            confirmChangeEmail: createConfirmChangeEmail({
                onSendChangeEmail: opts.onSendChangeEmail,
                expiresInMinutes: opts.expiresInMinutes,
            }),
            verifyChangeEmail: createVerifyChangeEmail(),
            changeEmailStatus: createChangeEmailStatus(),
            cancelChangeEmail: createCancelChangeEmail(),
            resendChangeEmailVerification: createResendVerificationChangeEmail({
                onSendChangeEmail: opts.onSendChangeEmail,
                resendCooldownSeconds: opts.resendCooldownSeconds,
            }),
        },
        rateLimit: [
            {
                pathMatcher: (path) => path.startsWith('/change-email/'),
                window: 60,
                max: 5,
            },
        ],
    } satisfies BetterAuthPlugin;
}
