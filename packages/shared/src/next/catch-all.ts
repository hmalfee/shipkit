import { trace } from '@opentelemetry/api';

import { ALLOWED_HTTP_METHODS } from '@shipkit/shared/constants';

import type { NextRequest } from 'next/server';

/** Handler you register; wildcard matches receive the leftover segments as `params.path`. */
export type RouteHandler = (
    req: NextRequest,
    context: { params?: { path?: string[] } | Promise<{ path?: string[] }> },
) => Response | Promise<Response>;

/** One of the allowlisted HTTP methods this router will dispatch. */
export type HttpMethod = (typeof ALLOWED_HTTP_METHODS)[number];

/**
 * Map of path → HTTP method → handler.
 *
 * Paths must start with `/` and are exact by default. Append `/*` for
 * prefix matching, e.g. `"/otel/*"` matches `/otel/v1/traces`.
 */
export type Routers = Record<string, Partial<Record<HttpMethod, RouteHandler>>>;

export interface CatchAllOptions {
    /**
     * Auto-detect the mount point from the request URL and also try
     * registered keys that include it.
     * e.g. mounted at /api → "/api/otel" resolves as if registered as "/otel"
     *
     * @default false
     */
    stripMountPrefix?: boolean;
    /** Called when a route matches, before invoking the handler. */
    onMatch?: (
        req: NextRequest,
        info: { route: string; method: string; prefix: string },
    ) => void;
    /** Called when no route matches. Defaults to `{ error: "Not found" }` with status 404. */
    onNotFound?: (
        req: NextRequest,
        info: { path: string; method: string },
    ) => Response | Promise<Response>;
}

const allowedMethods = new Set<string>(ALLOWED_HTTP_METHODS);

/** Fails loudly at router-creation time instead of as a silent 404 later. */
function validateEndpoints(endpoints: Routers): void {
    for (const [path, methods] of Object.entries(endpoints)) {
        if (!path.startsWith('/')) {
            throw new Error(
                `Invalid route path "${path}": path must start with "/".`,
            );
        }
        const bad = Object.keys(methods ?? {}).find(
            (m) => !allowedMethods.has(m),
        );
        if (bad) {
            throw new Error(
                `Invalid route method "${bad}" for path "${path}". ` +
                    `Use one of ${ALLOWED_HTTP_METHODS.join(', ')}.`,
            );
        }
    }
}

function fixSpan(route: string, method: string) {
    const span = trace.getActiveSpan();
    span?.setAttribute('http.route', route);
    span?.updateName(`${method} ${route}`);
}

/**
 * Creates a Next.js catch-all route handler that dispatches requests to
 * registered handlers by URL path and HTTP method.
 *
 * ```ts
 * createCatchAllRouter({
 *   '/health': { GET: healthHandler },                  // exact
 *   '/users': { GET: listUsers, POST: createUser },     // multiple methods
 *   '/otel/*': { POST: otelProxyHandler },              // wildcard, gets `params.path`
 * })
 * ```
 *
 * Place it in `app/api/[...slug]/route.ts` and re-export the returned
 * `{ GET, POST, PUT, PATCH, DELETE }`. Malformed entries throw immediately.
 */
export function createCatchAllRouter(
    endpoints: Routers,
    options: CatchAllOptions = {},
) {
    validateEndpoints(endpoints);

    async function handler(
        req: NextRequest,
        { params }: { params: Promise<{ slug: string[] }> },
    ) {
        const { slug } = await params;
        const method = req.method;
        const { pathname } = new URL(req.url);
        const slugPath = '/' + slug.join('/');
        const mountPath =
            options.stripMountPrefix && pathname.endsWith(slugPath)
                ? pathname.slice(0, -slugPath.length)
                : '';

        // Candidates in priority order: exact match, then wildcards (longest prefix first).
        const candidates = [{ prefix: slugPath, path: [] as string[] }];
        for (let i = slug.length - 1; i > 0; i--) {
            candidates.push({
                prefix: `/${slug.slice(0, i).join('/')}/*`,
                path: slug.slice(i),
            });
        }

        for (const { prefix, path } of candidates) {
            for (const route of mountPath
                ? [prefix, mountPath + prefix]
                : [prefix]) {
                const routeHandler = endpoints[route]?.[method as HttpMethod];
                if (!routeHandler) continue;

                fixSpan(route, method);
                options.onMatch?.(req, { route, method, prefix });
                return routeHandler(req, { params: { path } });
            }
        }

        fixSpan(pathname, method);
        return (
            options.onNotFound?.(req, { path: pathname, method }) ??
            Response.json({ error: 'Not found' }, { status: 404 })
        );
    }

    // Derived from ALLOWED_HTTP_METHODS so it can't drift out of sync with the allowlist.
    return Object.fromEntries(
        ALLOWED_HTTP_METHODS.map((method) => [method, handler]),
    ) as Record<HttpMethod, typeof handler>;
}
