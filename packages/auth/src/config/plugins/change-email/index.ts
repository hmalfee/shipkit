import type { BetterAuthPlugin } from 'better-auth';
import type { OtpConfig } from '../../types';
import type { ChangeEmailStage } from './helpers';

import {
    createChangeEmailStatus,
    createConfirmChangeEmail,
    createSendChangeEmailConfirmation,
    createSendChangeEmailVerification,
    createVerifyChangeEmail,
} from './endpoints';

export type ChangeEmailPluginOptions = {
    onSendChangeEmail: (
        payload:
            | {
                  stage: ChangeEmailStage;
                  /**
                   * Where the code goes: the user's current email for `confirmation`,
                   * their new email for `verification`.
                   * Note: You must use this email address to send the email.
                   */
                  email: string;
                  otp: string;
                  expiresInMinutes: number;
              }
            | {
                  stage: 'notification';
                  /** The OLD address. Tell the user their email changed and to contact support if it wasn't them. */
                  email: string;
                  newEmail: string;
              },
    ) => Promise<void>;
    otp: OtpConfig;
    /** Max verification emails per change request (first send included). */
    maxVerificationSends: number;
};

export function changeEmailPlugin(opts: ChangeEmailPluginOptions) {
    return {
        id: 'change-email',
        endpoints: {
            sendChangeEmailConfirmation:
                createSendChangeEmailConfirmation(opts),
            confirmChangeEmail: createConfirmChangeEmail(opts),
            sendChangeEmailVerification:
                createSendChangeEmailVerification(opts),
            verifyChangeEmail: createVerifyChangeEmail(opts),
            changeEmailStatus: createChangeEmailStatus(),
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
