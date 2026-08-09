import { createCatchAllRouter } from '@shipkit/shared/next/catch-all';
import { getActiveSpan } from '@shipkit/telemetry/node';
import { createOtelIngestHandler } from '@shipkit/telemetry/source-maps/next/server';

import { env } from '@/env';

import type { Routers } from '@shipkit/shared/next/catch-all';

export const dynamic = 'force-dynamic';

const endpoints: Routers = {};

if (env.NEXT_PUBLIC_OTEL_PROXY_PATH) {
    endpoints[env.NEXT_PUBLIC_OTEL_PROXY_PATH + '/*'] = createOtelIngestHandler(
        env.OTEL_URL,
    );
}

export const { GET, POST, PUT, PATCH, DELETE } = createCatchAllRouter(
    endpoints,
    {
        stripMountPrefix: true,
        onMatch: (_req, { route, method }) => {
            const span = getActiveSpan();
            span?.setAttribute('http.route', route);
            span?.updateName(`${method} ${route}`);
        },
        onNotFound: (_req, { path, method }) => {
            const span = getActiveSpan();
            span?.setAttribute('http.route', path);
            span?.updateName(`${method} ${path}`);
            return Response.json({ error: 'Not found' }, { status: 404 });
        },
    },
);
