import { createFetchClient } from '@shipkit/orpc-utils/query';
import { contract } from '@shipkit/shared/orpc';

import { env } from '@/env';

const isServer = typeof window === 'undefined';

/**
 * Raw, fully typed RPC client. Exposes every procedure (queries and
 * mutations) as a plain async call, with no React Query involved.
 *
 * Isomorphic: on the server it calls `INTERNAL_SERVER_URL` and forwards the
 * incoming request's cookies, in the browser it calls `NEXT_PUBLIC_SERVER_URL`
 * with `credentials: 'include'`.
 */
export const rpc = createFetchClient(contract, {
    url: isServer ? env.INTERNAL_SERVER_URL : env.NEXT_PUBLIC_SERVER_URL,
    fetch: (url, init) =>
        fetch(url, isServer ? init : { credentials: 'include', ...init }),
    ...(isServer && {
        headers: async (): Promise<Record<string, string>> => {
            const { cookies } = await import('next/headers');
            return { cookie: (await cookies()).toString() };
        },
    }),
});
