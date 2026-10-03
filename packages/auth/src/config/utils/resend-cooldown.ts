import { APIError } from 'better-auth/api';

import type { GenericEndpointContext } from 'better-auth';

export const DEFAULT_RESEND_COOLDOWN_SECONDS = 20;

/**
 * Enforces a minimum gap between emails sent for the same `key`.
 * Throws 429 if an email was triggered within the last `intervalSeconds`;
 * otherwise stamps the key and returns when the next send is allowed.
 */
export async function enforceResendCooldown(
    ctx: GenericEndpointContext,
    key: string,
    intervalSeconds: number,
): Promise<{ resendAvailableAt: number }> {
    const now = Date.now();
    const row = await ctx.context.internalAdapter
        .findVerificationValue(key)
        .catch(() => null);

    if (row && row.expiresAt.getTime() > now) {
        // No `code` on purpose: handleAuthError falls through to its plain
        // status match, which maps this to the contract's TOO_MANY_REQUESTS.
        throw new APIError('TOO_MANY_REQUESTS', {
            message:
                'Please wait a few seconds before requesting another email.',
        });
    }

    const resendAvailableAt = now + intervalSeconds * 1000;
    await ctx.context.internalAdapter.createVerificationValue({
        identifier: key,
        value: '1',
        expiresAt: new Date(resendAvailableAt),
    });
    return { resendAvailableAt };
}
