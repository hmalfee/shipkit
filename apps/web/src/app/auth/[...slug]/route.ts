import { createCatchAllRouter } from '@shipkit/shared/next/catch-all';
import { createProxyHandler } from '@shipkit/shared/next/proxy-handler';
import { contract } from '@shipkit/shared/orpc';

import { env } from '@/env';

import type { Routers } from '@shipkit/shared/next/catch-all';

export const dynamic = 'force-dynamic';

// Redirect proxies so transactional emails can use the main domain
// instead of the backend's domain/subdomain.
const proxiedRoutes = [
    contract.auth.email.verifyMagicLink['~orpc'].route,
    contract.auth.changeEmail.confirm['~orpc'].route,
    contract.auth.changeEmail.verify['~orpc'].route,
];

const handler = createProxyHandler(env.INTERNAL_SERVER_URL);

const endpoints: Routers = {};
for (const { path, method } of proxiedRoutes) {
    if (!path || !method) {
        continue;
    }
    endpoints[path] = { [method]: handler };
}

export const { GET, POST, PUT, PATCH, DELETE } = createCatchAllRouter(
    endpoints,
    { stripMountPrefix: true },
);
