import { NextResponse } from 'next/server';

import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
    const url = request.nextUrl.clone();
    // Defensive: internal RSC cache-busting param must never leak into `next`.
    url.searchParams.delete('_rsc');

    // Always overwrite: never trust a client-supplied value.
    const headers = new Headers(request.headers);
    headers.set('x-pathname', url.pathname + url.search);

    return NextResponse.next({ request: { headers } });
}

export const config = {
    // Page requests only: skip API routes, Next internals and static files.
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
