import { APIError } from 'better-auth/api';

import type { GenericEndpointContext } from 'better-auth';

/**
 * Enforces a minimum gap between emails sent for the same `key`.
 * Throws 429 if an email was triggered within the last `intervalSeconds`;
 * otherwise stamps the key.
 */
export async function enforceResendCooldown(
    ctx: GenericEndpointContext,
    key: string,
    intervalSeconds: number,
): Promise<void> {
    const row = await ctx.context.internalAdapter
        .findVerificationValue(key)
        .catch(() => null);

    if (row && row.expiresAt.getTime() > Date.now()) {
        throw new APIError('TOO_MANY_REQUESTS', {
            message:
                'Please wait a few seconds before requesting another email.',
        });
    }

    await ctx.context.internalAdapter.createVerificationValue({
        identifier: key,
        value: '1',
        expiresAt: new Date(Date.now() + intervalSeconds * 1000),
    });
}
