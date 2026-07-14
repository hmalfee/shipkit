import { NextResponse } from 'next/server';

import { logger } from '@shipkit/telemetry/logger';

import type { NextRequest } from 'next/server';

import nextConfig from '../next.config';

export function proxy(request: NextRequest) {
    // Even if when skipTrailingSlashRedirect is true, we still want to redirect
    // trailing slashes for routes that will render our UI/pages.
    if (nextConfig.skipTrailingSlashRedirect) {
        const { pathname, search } = request.nextUrl;
        if (pathname.endsWith('/') && pathname !== '/') {
            logger.info(`Proxy redirecting trailing slash for {pathname}`, {
                pathname,
            });
            return NextResponse.redirect(
                new URL(pathname.slice(0, -1) + search, request.url),
                308,
            );
        }
    }
    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!api/|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)',
    ],
};
