import type { BetterAuthOptions } from 'better-auth';
import type { AuthConfig } from './types';

/**
 * Configures better-auth's change email flow. Both the current and the new
 * email must be confirmed before the change is applied:
 *
 * 1. User requests the change; a link with a token goes to the *current* email.
 * 2. Confirming it sends a second link with a token to the *new* email.
 * 3. Verifying the new email applies the change.
 */
export function getChangeEmailConfig(
    config: AuthConfig,
): NonNullable<BetterAuthOptions['user']>['changeEmail'] {
    const { onSendChangeEmail } = config;
    if (!onSendChangeEmail) return undefined;

    return {
        enabled: true,
        // Step 1: link to the current email.
        sendChangeEmailConfirmation: async ({ user, newEmail, url, token }) =>
            onSendChangeEmail.confirmation({
                currentEmail: user.email,
                newEmail,
                token,
                callbackURL: new URL(url).searchParams.get('callbackURL') ?? '',
            }),
    };
}

function isChangeEmailVerificationToken(token: string): boolean {
    try {
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3 || !tokenParts[1]) return false;

        const payload = JSON.parse(
            Buffer.from(tokenParts[1], 'base64').toString(),
        ) as { requestType?: string };
        return payload.requestType === 'change-email-verification';
    } catch {
        return false; // Ignore parsing errors
    }
}

/**
 * Step 2: link to the new email. better-auth has no dedicated callback for
 * this and reuses its generic `sendVerificationEmail` hook, so we inspect the
 * JWT payload to detect a change-email token and forward it.
 *
 * Returns whether the verification was handled as a change-email verification.
 */
export async function sendChangeEmailVerification(
    config: AuthConfig,
    {
        user,
        url,
        token,
    }: { user: { email: string }; url: string; token: string },
): Promise<boolean> {
    if (!config.onSendChangeEmail) return false;
    if (!isChangeEmailVerificationToken(token)) return false;

    await config.onSendChangeEmail.verification({
        newEmail: user.email,
        token,
        callbackURL: new URL(url).searchParams.get('callbackURL') ?? '',
    });
    return true;
}
