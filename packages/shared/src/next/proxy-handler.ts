import { NextResponse } from 'next/server';

import type { NextRequest } from 'next/server';

/**
 * Creates a Next.js API route handler that proxies a request to an upstream
 * server, forwarding all query params, and returns the upstream's response
 * back to the client.
 *
 * - If the upstream responds with a redirect (3xx + Location header), the
 *   Location is re-resolved against the public origin (not the internal
 *   upstream host) before redirecting the browser. This re-resolution is
 *   not doable as a `next.config` rewrite, since the upstream's `Location`
 *   header is relative.
 * - For any other response, the status, body, and headers are passed
 *   through unchanged.
 * - `Set-Cookie` headers from the upstream are always forwarded.
 *
 * @param baseUrl - The base URL of the upstream server to proxy to.
 */
export function createProxyHandler(baseUrl: string) {
    return async function handler(request: NextRequest) {
        const { pathname, search } = request.nextUrl;

        const host =
            request.headers.get('x-forwarded-host') ??
            request.headers.get('host') ??
            request.nextUrl.host;
        const protocol =
            request.headers.get('x-forwarded-proto') ??
            request.nextUrl.protocol.replace(':', '');
        const origin = `${protocol}://${host}`;

        const apiUrl = new URL(`${baseUrl}${pathname}`);
        apiUrl.search = search;

        const response = await fetch(apiUrl, {
            // Don't let fetch auto-follow redirects — we need to inspect
            // and re-resolve the Location header ourselves.
            redirect: 'manual',
            headers: {
                cookie: request.headers.get('cookie') ?? '',
                origin,
            },
        });

        const setCookies = response.headers.getSetCookie();
        const location = response.headers.get('location');

        const isRedirect =
            response.status >= 300 &&
            response.status < 400 &&
            location !== null;

        if (isRedirect) {
            // Re-resolve against `origin` (the public host), not `baseUrl`
            // (the internal upstream host) — a key reason this proxy is
            // used instead of a next.config rewrite.
            const redirectTarget = new URL(location, origin);

            const redirectResponse = NextResponse.redirect(
                redirectTarget,
                response.status,
            );
            for (const cookie of setCookies) {
                redirectResponse.headers.append('set-cookie', cookie);
            }

            return redirectResponse;
        }

        // Non-redirect response: pass status, body, and headers through
        // as-is.
        const passthroughResponse = new NextResponse(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
        for (const cookie of setCookies) {
            passthroughResponse.headers.append('set-cookie', cookie);
        }

        return passthroughResponse;
    };
}
