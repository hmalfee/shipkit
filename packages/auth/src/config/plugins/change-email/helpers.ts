import { BASE_ERROR_CODES } from 'better-auth';
import { APIError, getSessionFromCtx } from 'better-auth/api';
import { generateRandomString } from 'better-auth/crypto';

import type { GenericEndpointContext } from 'better-auth';
import type { PendingEmailChange, QuotaData, TokenOwner } from './types';

const CHANGE_EMAIL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CHANGE_EMAIL_MAX_PER_WINDOW = 3;
const CHANGE_EMAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export function pendingChangeKey(userId: string) {
    return `change-email:${userId}`;
}
export function tokenIndexKey(token: string) {
    return `change-email-token:${token}`;
}
export function confirmThrottleKey(email: string) {
    return `change-email-resend-cooldown-confirm:${email}`;
}
export function verifyThrottleKey(email: string) {
    return `change-email-resend-cooldown-verify:${email}`;
}
function quotaKey(userId: string) {
    return `change-email-quota:${userId}`;
}

// ---------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------

export type QuotaBlock = {
    until: number; // timestamp when the user may request again
    reason: 'LIMIT_REACHED' | 'COOLDOWN';
};

export async function readQuota(
    ctx: GenericEndpointContext,
    userId: string,
): Promise<QuotaData | null> {
    const row = await ctx.context.internalAdapter
        .findVerificationValue(quotaKey(userId))
        .catch(() => null);
    return row ? (JSON.parse(row.value) as QuotaData) : null;
}

// Pure: is this quota blocking a new request right now?
export function getQuotaBlock(
    quota: QuotaData | null,
    now = Date.now(),
): QuotaBlock | null {
    if (!quota) return null;

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

// Call ONLY after the email change has actually been applied.
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

// ---------------------------------------------------------------------------
// Pending request + tokens
// ---------------------------------------------------------------------------

export async function readPending(
    ctx: GenericEndpointContext,
    userId: string,
): Promise<PendingEmailChange | null> {
    const row = await ctx.context.internalAdapter
        .findVerificationValue(pendingChangeKey(userId))
        .catch(() => null);
    return row ? (JSON.parse(row.value) as PendingEmailChange) : null;
}

export async function clearExistingRequest(
    ctx: GenericEndpointContext,
    userId: string,
) {
    const pending = await readPending(ctx, userId);
    if (!pending) return;

    // Delete all rows together; failures are best-effort
    await Promise.allSettled([
        ctx.context.internalAdapter.deleteVerificationByIdentifier(
            pendingChangeKey(userId),
        ),
        ctx.context.internalAdapter.deleteVerificationByIdentifier(
            tokenIndexKey(pending.token),
        ),
    ]);
}

// Mints a token and indexes it, so a clicked link can be traced back to its user.
export async function issueToken(
    ctx: GenericEndpointContext,
    userId: string,
    expiresInMinutes: number,
) {
    const token = generateRandomString(32, 'a-z', 'A-Z');
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000);

    await ctx.context.internalAdapter.createVerificationValue({
        identifier: tokenIndexKey(token),
        value: JSON.stringify({ userId } satisfies TokenOwner),
        expiresAt,
    });

    return { token, expiresAt };
}

// ---------------------------------------------------------------------------
// Email-link endpoints (confirm + verify)
// ---------------------------------------------------------------------------

export function redirectWithError(
    ctx: GenericEndpointContext,
    callbackURL: string | undefined,
    code: keyof typeof BASE_ERROR_CODES,
): never {
    const error = BASE_ERROR_CODES[code];
    if (!callbackURL) {
        throw new APIError('UNAUTHORIZED', {
            code: error.code,
            message: error.message,
        });
    }
    const url = new URL(callbackURL, ctx.context.baseURL);
    url.searchParams.set('error', error.code.toLocaleLowerCase());
    throw ctx.redirect(url.toString());
}

// Resolves an emailed token to its pending request and redirects with an error
// unless everything lines up for the expected stage.
export async function resolveTokenLink(
    ctx: GenericEndpointContext,
    { token, callbackURL }: { token: string; callbackURL?: string },
    stage: PendingEmailChange['stage'],
) {
    const tokenRow = await ctx.context.internalAdapter
        .findVerificationValue(tokenIndexKey(token))
        .catch(() => null);
    if (!tokenRow || tokenRow.expiresAt.getTime() < Date.now()) {
        redirectWithError(ctx, callbackURL, 'INVALID_TOKEN');
    }
    const { userId } = JSON.parse(tokenRow.value) as TokenOwner;

    const pending = await readPending(ctx, userId);
    if (!pending || pending.stage !== stage || pending.token !== token) {
        redirectWithError(ctx, callbackURL, 'INVALID_TOKEN');
    }

    // The link may be opened in a browser signed in as someone else
    const activeSession = await getSessionFromCtx(ctx).catch(() => null);
    if (activeSession && activeSession.user.id !== userId) {
        redirectWithError(ctx, callbackURL, 'INVALID_USER');
    }

    return { userId, pending, activeSession };
}
