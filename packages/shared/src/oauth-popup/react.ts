'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
    OAuthError,
    OAuthPopupErrorCode,
    OAuthResponse,
} from './protocol';

import { OAUTH_POPUP_CALLBACK_PATH } from '../constants';
import {
    OAUTH_POPUP_CHANNEL,
    OAUTH_POPUP_ERROR_CODES,
    OAUTH_POPUP_NONCE_COOKIE,
    parseOAuthPopupMessage,
} from './protocol';

export interface OAuthErrorCopy {
    title: string;
    description: string;
}

export interface PopupWindowOptions {
    width?: number;
    height?: number;
    top?: number;
    left?: number;
}

export const POPUP_SIZES = {
    compact: { width: 464, height: 560 },
    default: { width: 480, height: 620 },
    tall: { width: 520, height: 700 },
} satisfies Record<string, PopupWindowOptions>;

const KNOWN_COPY: Record<OAuthPopupErrorCode, OAuthErrorCopy> = {
    [OAUTH_POPUP_ERROR_CODES.Closed]: {
        title: 'Sign-in cancelled',
        description: 'The sign-in window was closed before you finished.',
    },
    [OAUTH_POPUP_ERROR_CODES.Blocked]: {
        title: 'Popup blocked',
        description:
            'Your browser blocked the sign-in window. Allow popups for this site and try again.',
    },
    [OAUTH_POPUP_ERROR_CODES.UrlError]: {
        title: "Couldn't start sign-in",
        description: 'We could not reach the provider. Please try again.',
    },
    [OAUTH_POPUP_ERROR_CODES.Failed]: {
        title: 'Sign-in failed',
        description:
            'Something went wrong while signing you in. Please try again.',
    },
};

const POLL_INTERVAL_MS = 500;
// After the popup reports `closed`, wait before declaring it cancelled so an
// in-flight success message (it posts and closes immediately) can win the race.
const CLOSED_GRACE_MS = 500;
const FLOW_COOKIE_MAX_AGE_S = 600;

/**
 * Friendly title/description for an error code. Never exposes a raw code and
 * never shows provider-supplied text (it arrives via an attacker-controllable URL).
 */
export function getOAuthErrorCopy(code: string): OAuthErrorCopy {
    if (Object.hasOwn(KNOWN_COPY, code)) {
        return KNOWN_COPY[code as OAuthPopupErrorCode];
    }
    // `access_denied` -> `Access denied`
    const words = code.replace(/[_-]+/g, ' ').trim().toLowerCase();
    return {
        title: words
            ? words.charAt(0).toUpperCase() + words.slice(1)
            : KNOWN_COPY[OAUTH_POPUP_ERROR_CODES.Failed].title,
        description: 'Please try again.',
    };
}

const failure = (code: string): OAuthError => ({
    success: false,
    error: { code, ...getOAuthErrorCopy(code) },
});

function getPopupFeatures({
    width = POPUP_SIZES.default.width,
    height = POPUP_SIZES.default.height,
    top = window.screenY + Math.round((window.outerHeight - height) / 2),
    left = window.screenX + Math.round((window.outerWidth - width) / 2),
}: PopupWindowOptions = {}) {
    return `popup=yes,width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`;
}

/**
 * The popup is `about:blank` and inherits our origin, so a `javascript:` or
 * `data:` URL here would run script in the opener's origin. Allow http(s) only.
 */
function toHttpUrl(url: string): string {
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
    }
    return parsed.href;
}

/**
 * Marks this browser as having started a flow and returns the nonce. The
 * callback route 404s without the cookie and echoes the nonce in its message.
 * SameSite=Lax (not Strict): the final hop is a cross-site redirect chain
 * ending in a top-level GET, which Lax sends and Strict drops.
 */
function startFlow(): string {
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
        b.toString(16).padStart(2, '0'),
    ).join('');
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${OAUTH_POPUP_NONCE_COOKIE}=${nonce}; Max-Age=${FLOW_COOKIE_MAX_AGE_S}; Path=${OAUTH_POPUP_CALLBACK_PATH}; SameSite=Lax${secure}`;
    return nonce;
}

const endFlow = () => {
    document.cookie = `${OAUTH_POPUP_NONCE_COOKIE}=; Max-Age=0; Path=${OAUTH_POPUP_CALLBACK_PATH}`;
};

/**
 * Opener-side OAuth popup flow. Resolves with the response posted by the
 * OAuth callback handler, or an OAuthError for blocked / closed / URL errors.
 *
 * Messages are only accepted if they echo this attempt's nonce, which blocks
 * forged messages and cross-tab crosstalk. Still, treat `success` as a signal:
 * confirm the session (e.g. refetch it) before treating the user as signed in.
 */
export function useOAuthPopup() {
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [error, setError] = useState<OAuthErrorCopy | undefined>();
    // Cancels the in-flight attempt (if any).
    const cancelRef = useRef<(() => void) | null>(null);

    const closeOAuthPopup = useCallback(() => cancelRef.current?.(), []);

    // Abort a flow that is still running when the component unmounts.
    useEffect(() => closeOAuthPopup, [closeOAuthPopup]);

    const openOAuthPopup = useCallback(
        (
            getUrl: () => Promise<string> | string,
            options?: PopupWindowOptions,
        ): Promise<OAuthResponse> => {
            cancelRef.current?.(); // one attempt at a time
            setError(undefined);

            return new Promise((resolve) => {
                // Must be synchronous inside the click's call stack, or
                // popup blockers reject it.
                const popup = window.open(
                    'about:blank',
                    OAUTH_POPUP_CHANNEL,
                    getPopupFeatures(options),
                );
                if (!popup) {
                    const response = failure(OAUTH_POPUP_ERROR_CODES.Blocked);
                    setError(response.error);
                    resolve(response);
                    return;
                }

                const nonce = startFlow();
                let settled = false;
                const cleanups: Array<() => void> = [endFlow];

                const settle = (response: OAuthResponse, silent = false) => {
                    if (settled) return;
                    settled = true;
                    for (const cleanup of cleanups) cleanup();
                    try {
                        popup.close();
                    } catch {
                        // Already closed or cross-origin-isolated.
                    }
                    cancelRef.current = null;
                    setIsPopupOpen(false);
                    setError(
                        silent || response.success
                            ? undefined
                            : {
                                  title: response.error.title,
                                  description: response.error.description,
                              },
                    );
                    resolve(response);
                };

                const handleData = (data: unknown) => {
                    const payload = parseOAuthPopupMessage(data, nonce);
                    if (!payload) return;
                    settle(
                        payload.success ? payload : failure(payload.error.code),
                    );
                };

                // Channel 1: window.postMessage (needs a live window.opener).
                const onMessage = (event: MessageEvent<unknown>) => {
                    if (
                        event.origin === window.location.origin &&
                        event.source === popup
                    ) {
                        handleData(event.data);
                    }
                };
                window.addEventListener('message', onMessage);
                cleanups.push(() =>
                    window.removeEventListener('message', onMessage),
                );

                // Channel 2: BroadcastChannel (survives a severed opener).
                // Same-origin only; the nonce check stands in for sender identity.
                if (typeof BroadcastChannel !== 'undefined') {
                    const channel = new BroadcastChannel(OAUTH_POPUP_CHANNEL);
                    channel.onmessage = (event: MessageEvent<unknown>) =>
                        handleData(event.data);
                    cleanups.push(() => channel.close());
                }

                // Fallback: user closed the popup manually.
                let closedTimer: number | undefined;
                const pollTimer = window.setInterval(() => {
                    if (popup.closed && closedTimer === undefined) {
                        closedTimer = window.setTimeout(
                            () =>
                                settle(failure(OAUTH_POPUP_ERROR_CODES.Closed)),
                            CLOSED_GRACE_MS,
                        );
                    }
                }, POLL_INTERVAL_MS);
                cleanups.push(() => {
                    window.clearInterval(pollTimer);
                    window.clearTimeout(closedTimer);
                });

                cancelRef.current = () =>
                    settle(failure(OAUTH_POPUP_ERROR_CODES.Closed), true);
                setIsPopupOpen(true);

                // Fetch the provider URL, then navigate the already-open popup.
                // `then(getUrl)` also routes synchronous throws to the catch.
                Promise.resolve()
                    .then(getUrl)
                    .then((url) => {
                        if (!settled) popup.location.href = toHttpUrl(url);
                    })
                    .catch(() =>
                        settle(failure(OAUTH_POPUP_ERROR_CODES.UrlError)),
                    );
            });
        },
        [],
    );

    return { isPopupOpen, openOAuthPopup, closeOAuthPopup, error };
}
