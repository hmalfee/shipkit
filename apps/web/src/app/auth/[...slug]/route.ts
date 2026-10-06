import { OAUTH_POPUP_CALLBACK_PATH } from '@shipkit/shared/constants';
import { createCatchAllRouter } from '@shipkit/shared/next/catch-all';
import { createProxyHandler } from '@shipkit/shared/next/proxy-handler';
import { createOAuthPopupHandler } from '@shipkit/shared/oauth-popup/next';
import { contract } from '@shipkit/shared/orpc-contract';

import { env } from '@/env';

import type { Routers } from '@shipkit/shared/next/catch-all';

export const dynamic = 'force-dynamic';

// Redirect proxies so transactional emails can use the main domain
// instead of the backend's domain/subdomain.
const proxiedRoutes = [
    contract.auth.email.verify.magicLink['~orpc'].route,
    contract.auth.changeEmail.confirm['~orpc'].route,
    contract.auth.changeEmail.verify['~orpc'].route,
    contract.auth.oauth.callback['~orpc'].route,
];

const handler = createProxyHandler(env.INTERNAL_SERVER_URL);

const endpoints: Routers = {
    // @see [OAuth Popup Flow] Mounts the callback page which receives the backend redirect and securely messages the opener window to close the popup.
    [OAUTH_POPUP_CALLBACK_PATH]: {
        GET: createOAuthPopupHandler(),
    },
};

for (const { path, method } of proxiedRoutes) {
    if (!path || !method) {
        continue;
    }

    // oRPC routes can have path parameters (e.g. /users/{id}/settings), but
    // Next.js catch-all routes don't support them. So we just remove the first
    // path parameter and everything after it with a wildcard.
    // e.g. /oauth/callback/{provider} -> /oauth/callback/*
    // e.g. /users/{id}/settings -> /users/*
    const catchAllPath = path.replace(/\/\{.*$/, '/*');

    endpoints[catchAllPath] = {
        ...endpoints[catchAllPath],
        [method]: handler,
    };
}

export const { GET, POST, PUT, PATCH, DELETE } = createCatchAllRouter(
    endpoints,
    { stripMountPrefix: true },
);
