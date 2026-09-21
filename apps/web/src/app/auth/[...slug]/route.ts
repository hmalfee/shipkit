import { createCatchAllRouter } from '@shipkit/shared/next/catch-all';
import { createProxyHandler } from '@shipkit/shared/next/proxy-handler';
import { contract } from '@shipkit/shared/orpc';

import { env } from '@/env';

import type { Routers } from '@shipkit/shared/next/catch-all';

export const dynamic = 'force-dynamic';

const endpoints: Routers = {};

const verifyMagicLinkPath =
    contract.auth.email.verifyMagicLink['~orpc'].route.path;

if (verifyMagicLinkPath) {
    // We create a redirect proxy to this route so that in transactional emails we
    // can use the main domain instead of the backend's domain/subdomain.
    endpoints[verifyMagicLinkPath] = createProxyHandler(
        // use the internal URL since this is server-side
        env.INTERNAL_SERVER_URL,
    );
}

export const { GET, POST, PUT, PATCH, DELETE } = createCatchAllRouter(
    endpoints,
    {
        stripMountPrefix: true,
    },
);
