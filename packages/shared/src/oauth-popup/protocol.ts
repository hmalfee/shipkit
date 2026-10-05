/** Error codes the popup protocol itself produces (not the provider's). */
export const OAUTH_POPUP_ERROR_CODES = {
    Blocked: 'popup_blocked',
    Closed: 'popup_closed',
    UrlError: 'url_error',
    Failed: 'authentication_failed',
} as const;

export const OAUTH_POPUP_CHANNEL = 'oauth_popup';
export const OAUTH_POPUP_MESSAGE_TYPE = 'OAUTH_RESPONSE';
/** Short-lived cookie proving this browser started the flow (see `startFlow`). */
export const OAUTH_POPUP_NONCE_COOKIE = 'oauth_popup_nonce';

export type OAuthPopupErrorCode =
    (typeof OAUTH_POPUP_ERROR_CODES)[keyof typeof OAUTH_POPUP_ERROR_CODES];

/**
 * Wire format: what the callback page sends. Data only, no UI copy.
 * Deliberately carries no free-text description: the callback URL is
 * attacker-controllable, so only a short, validated code crosses the wire.
 */
export type OAuthPopupPayload =
    { success: true; data: null } | { success: false; error: { code: string } };

export interface OAuthPopupMessage {
    type: typeof OAUTH_POPUP_MESSAGE_TYPE;
    /** Echo of the opener's nonce; the opener ignores messages without its own. */
    nonce: string;
    payload: OAuthPopupPayload;
}

/** What `useOAuthPopup` resolves with on failure. Ready to render. */
export interface OAuthError {
    success: false;
    error: { code: string; title: string; description: string };
}

export type OAuthResponse = { success: true; data: null } | OAuthError;

const ERROR_CODE_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
const NONCE_PATTERN = /^[A-Za-z0-9]{16,64}$/;

export const isValidNonce = (value: unknown): value is string =>
    typeof value === 'string' && NONCE_PATTERN.test(value);

/** Returns `code` if it is a short, safe identifier, else the generic failure code. */
export function toSafeErrorCode(code: unknown): string {
    const trimmed = typeof code === 'string' ? code.trim() : '';
    return ERROR_CODE_PATTERN.test(trimmed)
        ? trimmed
        : OAUTH_POPUP_ERROR_CODES.Failed;
}

/**
 * Validates untrusted data from either channel. Returns undefined to ignore it,
 * including any message that doesn't carry the opener's own nonce.
 */
export function parseOAuthPopupMessage(
    data: unknown,
    expectedNonce: string,
): OAuthPopupPayload | undefined {
    if (typeof data !== 'object' || data === null) return undefined;
    const message = data as {
        type?: unknown;
        nonce?: unknown;
        payload?: {
            success?: unknown;
            error?: { code?: unknown } | null;
        } | null;
    };
    if (
        message.type !== OAUTH_POPUP_MESSAGE_TYPE ||
        message.nonce !== expectedNonce
    ) {
        return undefined;
    }
    const payload = message.payload;
    if (payload?.success === true) return { success: true, data: null };
    if (payload?.success === false) {
        return {
            success: false,
            error: { code: toSafeErrorCode(payload.error?.code) },
        };
    }
    return undefined;
}
