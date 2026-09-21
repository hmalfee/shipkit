import { createCatchAllRouter } from '@shipkit/shared/next/catch-all';
import { createProxyHandler } from '@shipkit/shared/next/proxy-handler';
import { contract } from '@shipkit/shared/orpc';

import { env } from '@/env';

import type { Routers } from '@shipkit/shared/next/catch-all';

export const dynamic = 'force-dynamic';

// Redirect proxies so transactional emails can use the main domain
// instead of the backend's domain/subdomain.
const proxiedPaths = [
    contract.auth.email.verifyMagicLink['~orpc'].route.path,
    contract.auth.changeEmail.verify['~orpc'].route.path,
].filter(Boolean) as string[];

const endpoints: Routers = Object.fromEntries(
    proxiedPaths.map((path) => [
        path,
        createProxyHandler(env.INTERNAL_SERVER_URL),
    ]),
);

export const { GET, POST, PUT, PATCH, DELETE } = createCatchAllRouter(
    endpoints,
    { stripMountPrefix: true },
);
