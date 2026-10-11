import { BASE_ERROR_CODES } from 'better-auth';
import { APIError } from 'better-auth/api';
import { constantTimeEqual } from 'better-auth/crypto';

import type { GenericEndpointContext } from 'better-auth';

const CHANGE_EMAIL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CHANGE_EMAIL_MAX_PER_WINDOW = 3;
const CHANGE_EMAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

type QuotaData = {
    /** Completed changes in the current window. */
    count: number;
    /** Timestamp of the first completed change in the window. */
    windowStart: number;
    /** Timestamp of the most recent completed change. */
    lastChangeAt?: number;
};

export type ChangeEmailStage = 'confirmation' | 'verification';

type RequestValue = {
    /** `confirmation`: waiting for the code sent to the current email.
     *  `verification`: step-up done, codes go to the new email. */
    phase: ChangeEmailStage;
    /** The code waiting to be typed. Removed once its attempts run out.
     *  `email` (sanitized new address) is only set in `verification`. */
    code?: { otp: string; attempts: number; email?: string };
    /** Verification emails sent so far, and when the last one went out. */
    sends: number;
    lastSentAt?: number;
};

function quotaKey(userId: string) {
    return `change-email-quota:${userId}`;
}
function requestKey(userId: string) {
    return `change-email-request:${userId}`;
}

// ---------- Quota management ----------

async function readQuota(
    ctx: GenericEndpointContext,
    userId: string,
): Promise<QuotaData | null> {
    const row = await ctx.context.internalAdapter
        .findVerificationValue(quotaKey(userId))
        .catch(() => null);
    return row ? (JSON.parse(row.value) as QuotaData) : null;
}

export async function getQuotaBlock(
    ctx: GenericEndpointContext,
    userId: string,
): Promise<{
    until: number;
    reason: 'LIMIT_REACHED' | 'COOLDOWN';
} | null> {
    const quota = await readQuota(ctx, userId);
    if (!quota) return null;

    const now = Date.now();
    const windowEnd = quota.windowStart + CHANGE_EMAIL_WINDOW_MS;
    const limitUntil =
        now < windowEnd && quota.count >= CHANGE_EMAIL_MAX_PER_WINDOW
            ? windowEnd
            : 0;
    const cooldownUntil = quota.lastChangeAt
        ? quota.lastChangeAt + CHANGE_EMAIL_COOLDOWN_MS
        : 0;

    const until = Math.max(limitUntil, cooldownUntil);
    if (until <= now) return null;

    return {
        until,
        reason: limitUntil >= cooldownUntil ? 'LIMIT_REACHED' : 'COOLDOWN',
    };
}

export async function assertNoQuotaBlock(
    ctx: GenericEndpointContext,
    userId: string,
) {
    const block = await getQuotaBlock(ctx, userId);
    if (!block) return;

    throw new APIError('TOO_MANY_REQUESTS', {
        code: BASE_ERROR_CODES.EMAIL_CAN_NOT_BE_UPDATED.code,
        message:
            block.reason === 'LIMIT_REACHED'
                ? 'Email change limit reached.'
                : 'Please wait before changing your email again.',
    });
}

export async function recordCompletedChange(
    ctx: GenericEndpointContext,
    userId: string,
) {
    const now = Date.now();
    const existing = await readQuota(ctx, userId);

    // Start a fresh window if there is none or the old one has expired
    const next: QuotaData =
        existing && now - existing.windowStart <= CHANGE_EMAIL_WINDOW_MS
            ? { ...existing, count: existing.count + 1, lastChangeAt: now }
            : { count: 1, windowStart: now, lastChangeAt: now };

    // Row must live until both the window and the cooldown are over
    const row = {
        value: JSON.stringify(next),
        expiresAt: new Date(
            Math.max(
                next.windowStart + CHANGE_EMAIL_WINDOW_MS,
                now + CHANGE_EMAIL_COOLDOWN_MS,
            ),
        ),
    };

    if (existing) {
        await ctx.context.internalAdapter.updateVerificationByIdentifier(
            quotaKey(userId),
            row,
        );
    } else {
        await ctx.context.internalAdapter.createVerificationValue({
            identifier: quotaKey(userId),
            ...row,
        });
    }
}

// ---------- Request management ----------

export async function claimRequest(
    ctx: GenericEndpointContext,
    userId: string,
): Promise<{ value: RequestValue; expiresAt: Date }> {
    const row = await ctx.context.internalAdapter.consumeVerificationValue(
        requestKey(userId),
    );
    if (!row || row.expiresAt.getTime() <= Date.now())
        throw new APIError('FORBIDDEN', {
            message: 'Confirm the code sent to your current email first.',
        });
    return {
        value: JSON.parse(row.value) as RequestValue,
        expiresAt: row.expiresAt,
    };
}

export function storeRequest(
    ctx: GenericEndpointContext,
    userId: string,
    request: { value: RequestValue; expiresAt: Date },
) {
    return ctx.context.internalAdapter.createVerificationValue({
        identifier: requestKey(userId),
        value: JSON.stringify(request.value),
        expiresAt: request.expiresAt,
    });
}

export async function redeemCode(
    ctx: GenericEndpointContext,
    userId: string,
    phase: RequestValue['phase'],
    otp: string,
    maxAttempts: number,
) {
    const request = await claimRequest(ctx, userId);
    const { code, ...rest } = request.value;
    if (request.value.phase !== phase || !code) {
        await storeRequest(ctx, userId, request); // soft failure, put it back untouched
        throw new APIError('BAD_REQUEST', {
            code: BASE_ERROR_CODES.INVALID_TOKEN.code,
            message: 'Request a code first.',
        });
    }
    if (constantTimeEqual(code.otp, otp.trim())) return code;

    const attempts = code.attempts + 1;
    const locked = attempts >= maxAttempts;
    await storeRequest(ctx, userId, {
        ...request,
        value: locked ? rest : { ...rest, code: { ...code, attempts } },
    });
    throw locked
        ? new APIError('TOO_MANY_REQUESTS', {
              message: 'Too many attempts. Please request a new code.',
          })
        : new APIError('BAD_REQUEST', {
              code: BASE_ERROR_CODES.INVALID_TOKEN.code,
              message: 'Code is invalid.',
          });
}

export async function clearRequest(
    ctx: GenericEndpointContext,
    userId: string,
) {
    return ctx.context.internalAdapter
        .deleteVerificationByIdentifier(requestKey(userId))
        .catch(() => {
            // ignore
        });
}
