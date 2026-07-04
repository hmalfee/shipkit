import { NextResponse } from 'next/server';

import { createOtelIngestHandler } from '@mento-mark/telemetry/source-maps/next/server';

import { env } from '@/env';

import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

type Routers = Record<
    string,
    (
        req: NextRequest,
        context: {
            params?: { path?: string[] } | Promise<{ path?: string[] }>;
        },
    ) => Response | Promise<Response>
>;

/**
 * Route handlers keyed by URL prefix.
 *
 * Keys must start with `/` (e.g. `/v1/webhooks`, `/otel`).
 * Nesting is supported — a key like `/hello/world` matches
 * `/api/hello/world` and any deeper segments are forwarded
 * to the handler as `params.path`.
 *
 * Note: `beforeFiles`/`afterFiles` rewrites in next.config take
 * precedence over this catch-all — only unmatched or fallback
 * rewrites reach here.
 */
const routers: Routers = {};

// Register the OpenTelemetry ingest handler if the proxy path is configured.
if (env.NEXT_PUBLIC_OTEL_PROXY_PATH) {
    const path = env.NEXT_PUBLIC_OTEL_PROXY_PATH.replace(/^\/api\//, '/');
    routers[path] = createOtelIngestHandler(env.OTEL_URL);
}

async function handler(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string[] }> },
) {
    const { slug } = await params;

    for (let i = slug.length; i > 0; i--) {
        const prefix = '/' + slug.slice(0, i).join('/');
        const router = routers[prefix];
        if (router) {
            return router(req, { params: { path: slug.slice(i) } });
        }
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export {
    handler as GET,
    handler as POST,
    handler as PUT,
    handler as PATCH,
    handler as DELETE,
};
