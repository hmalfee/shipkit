import type { BetterAuthPlugin } from 'better-auth';
import type { ChangeEmailPluginOptions } from './types';

import {
    createCancelChangeEmail,
    createChangeEmailStatus,
    createConfirmChangeEmail,
    createRequestChangeEmail,
    createVerifyChangeEmail,
} from './endpoints';

export type { ChangeEmailPluginOptions } from './types';

const DEFAULT_EXPIRES_IN_MINUTES = 60;

export function changeEmailPlugin(opts: ChangeEmailPluginOptions) {
    const expiresInMinutes =
        opts.expiresInMinutes ?? DEFAULT_EXPIRES_IN_MINUTES;

    return {
        id: 'change-email',
        endpoints: {
            requestChangeEmail: createRequestChangeEmail(
                opts,
                expiresInMinutes,
            ),
            confirmChangeEmail: createConfirmChangeEmail(
                opts,
                expiresInMinutes,
            ),
            verifyChangeEmail: createVerifyChangeEmail(),
            changeEmailStatus: createChangeEmailStatus(),
            cancelChangeEmail: createCancelChangeEmail(),
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
