import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { rpc } from '@/lib/api/rpc';
import { REDIRECT_PARAM } from '@/lib/constants';
import { sanitizeRedirect } from '@/lib/utils';

import type { Route } from 'next';

/**
 * Every route under (protected) requires a signed-in user.
 * Public pages (e.g. /auth) live beside this folder, not inside it.
 *
 * Keep the guard here, above any Suspense/loading boundary. Redirecting from
 * below one turns the HTTP 307 into a client-side redirect on a 200 response.
 */
export default async function ProtectedLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    const user = await rpc.auth.me();

    if (!user.body) {
        // x-pathname is set by the proxy.ts, which runs before this layout
        const redirectPath = sanitizeRedirect(
            (await headers()).get('x-pathname'),
        );
        redirect(
            `${'/auth' satisfies Route}?${REDIRECT_PARAM}=${encodeURIComponent(redirectPath)}` as Route,
        );
    }

    return <>{children}</>;
}
