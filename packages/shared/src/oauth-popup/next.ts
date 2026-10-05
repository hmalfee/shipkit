import 'server-only';

import { createHash } from 'node:crypto';

import { notFound } from 'next/navigation';

import type { OAuthPopupMessage, OAuthPopupPayload } from './protocol';

import { OAUTH_POPUP_CALLBACK_PATH } from '../constants';
import {
    isValidNonce,
    OAUTH_POPUP_CHANNEL,
    OAUTH_POPUP_MESSAGE_TYPE,
    OAUTH_POPUP_NONCE_COOKIE,
    toSafeErrorCode,
} from './protocol';

const PAYLOAD_ELEMENT_ID = 'oauth-payload';

// Constant on purpose: a static script can be allow-listed by hash in the CSP.
// It reads the payload from a JSON data block instead of interpolating into JS.
// Do not make this (or CALLBACK_STYLE) configurable.
const CALLBACK_SCRIPT = `(function () {
  var message;
  try {
    message = JSON.parse(document.getElementById('${PAYLOAD_ELEMENT_ID}').textContent);
  } catch (e) {
    return;
  }
  try {
    if (window.opener) window.opener.postMessage(message, location.origin);
  } catch (e) {}
  try {
    var channel = new BroadcastChannel('${OAUTH_POPUP_CHANNEL}');
    channel.postMessage(message);
    channel.close();
  } catch (e) {}
  window.close();
})();`;

const CALLBACK_STYLE =
    ':root{color-scheme:light dark}' +
    'body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif}' +
    'p{margin:0;padding:1rem;text-align:center;opacity:.7}';

const sha256 = (value: string) =>
    `'sha256-${createHash('sha256').update(value).digest('base64')}'`;

// Strict CSP for this tiny page: only our exact script and style may run.
const CONTENT_SECURITY_POLICY = [
    "default-src 'none'",
    `script-src ${sha256(CALLBACK_SCRIPT)}`,
    `style-src ${sha256(CALLBACK_STYLE)}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
].join('; ');

const RESPONSE_HEADERS = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': CONTENT_SECURITY_POLICY,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-robots-tag': 'noindex',
};

// Expires the nonce cookie so the callback page works once per started flow.
const CLEAR_NONCE_COOKIE = `${OAUTH_POPUP_NONCE_COOKIE}=; Max-Age=0; Path=${OAUTH_POPUP_CALLBACK_PATH}; SameSite=Lax`;

/** The nonce set by `useOAuthPopup` when the flow started, if present and well-formed. */
function readNonce(request: Request): string | undefined {
    const prefix = `${OAUTH_POPUP_NONCE_COOKIE}=`;
    const value = request.headers
        .get('cookie')
        ?.split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(prefix))
        ?.slice(prefix.length);
    return isValidNonce(value) ? value : undefined;
}

/** Only a validated error code is ever read from the URL; descriptions are dropped. */
function getPayload(params: URLSearchParams): OAuthPopupPayload {
    if (!params.has('error') && !params.has('error_description')) {
        return { success: true, data: null };
    }
    return {
        success: false,
        error: { code: toSafeErrorCode(params.get('error')) },
    };
}

/**
 * Serialize JSON so it is safe inside an HTML <script> element:
 * prevents `</script>` / `<!--` breakouts and JS line-terminator issues.
 */
const serializeForHtml = (value: unknown) =>
    JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');

function render(nonce: string, payload: OAuthPopupPayload): Response {
    const message: OAuthPopupMessage = {
        type: OAUTH_POPUP_MESSAGE_TYPE,
        nonce,
        payload,
    };
    // Copy is static, so no escaping is needed. Keep it that way.
    const [title, body] = payload.success
        ? ['Signed in', 'Signed in. You can close this window.']
        : ['Sign-in failed', 'Sign-in failed. You can close this window.'];

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>${CALLBACK_STYLE}</style>
</head>
<body>
<p>${body}</p>
<script type="application/json" id="${PAYLOAD_ELEMENT_ID}">${serializeForHtml(message)}</script>
<script>${CALLBACK_SCRIPT}</script>
</body>
</html>`;

    const headers = new Headers(RESPONSE_HEADERS);
    headers.append('set-cookie', CLEAR_NONCE_COOKIE);
    return new Response(html, { headers });
}

/**
 * Use as a route handler: `export const GET = createOAuthPopupHandler();`
 * Responds 404 unless the request carries the nonce cookie set when a popup
 * flow was started in this browser, so the page can't be browsed to directly.
 */
export function createOAuthPopupHandler() {
    return (request: Request): Response => {
        const nonce = readNonce(request);
        if (!nonce) return notFound();
        return render(nonce, getPayload(new URL(request.url).searchParams));
    };
}
