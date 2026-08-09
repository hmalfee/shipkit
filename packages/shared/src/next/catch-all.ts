import type { NextRequest } from 'next/server';

export type RouteHandler = (
    req: NextRequest,
    context: { params?: { path?: string[] } | Promise<{ path?: string[] }> },
) => Response | Promise<Response>;

export type Routers = Record<string, RouteHandler>;

export interface CatchAllOptions {
    /**
     * Auto-detect the mount point from the request URL and also try
     * matching registered keys that include it.
     * e.g. mounted at /api → key "/api/otel" resolves as if registered as "/otel"
     *
     * @default false
     */
    stripMountPrefix?: boolean;
    /**
     * Called when a route matches, before invoking the handler.
     * Use for telemetry, logging, etc.
     */
    onMatch?: (
        req: NextRequest,
        info: { route: string; method: string; prefix: string },
    ) => void;
    /**
     * Called when no route matches. Return a custom response.
     * Defaults to `{ error: "Not found" }` with status 404.
     */
    onNotFound?: (
        req: NextRequest,
        info: { path: string; method: string },
    ) => Response | Promise<Response>;
}

/**
 * Creates a Next.js catch-all route handler that dispatches requests to
 * registered handlers based on the incoming URL path.
 *
 * Routes are **exact by default**. To match a path and all sub-paths beneath
 * it (e.g. a proxy), append `/*` to the key:
 *
 * ```ts
 * // exact — only matches POST /health
 * createCatchAllRouter({ '/health': healthHandler })
 *
 * // wildcard — matches /otel/v1/traces, /otel/v1/logs, etc.
 * // remaining segments are forwarded as `context.params.path`
 * createCatchAllRouter({ '/otel/*': otelProxyHandler })
 * ```
 *
 * Place this in `app/api/[...slug]/route.ts` and re-export the returned
 * `{ GET, POST, PUT, PATCH, DELETE }` object.
 *
 * @param endpoints - Map of path → handler. Keys should start with `/`.
 *   Append `/*` to a key for wildcard (prefix) matching.
 * @param options - Optional config: mount-prefix stripping and lifecycle hooks.
 */
export function createCatchAllRouter(
    endpoints: Routers,
    options?: CatchAllOptions,
) {
    async function handler(
        req: NextRequest,
        { params }: { params: Promise<{ slug: string[] }> },
    ) {
        const { slug } = await params;

        let mountPath = '';
        if (options?.stripMountPrefix) {
            const url = new URL(req.url);
            const slugPath = '/' + slug.join('/');
            if (url.pathname.endsWith(slugPath)) {
                mountPath = url.pathname.slice(0, -slugPath.length);
            }
        }

        // --- Phase 1: Exact match ---
        const exactPath = '/' + slug.join('/');
        let router = endpoints[exactPath];
        let matchedKey = exactPath;

        if (!router && mountPath) {
            const mounted = mountPath + exactPath;
            router = endpoints[mounted];
            if (router) matchedKey = mounted;
        }

        if (router) {
            options?.onMatch?.(req, {
                route: matchedKey,
                method: req.method,
                prefix: exactPath,
            });
            return router(req, { params: { path: [] } });
        }

        // --- Phase 2: Wildcard match (longest prefix first) ---
        for (let i = slug.length - 1; i > 0; i--) {
            const prefix = '/' + slug.slice(0, i).join('/') + '/*';
            router = endpoints[prefix];
            matchedKey = prefix;

            if (!router && mountPath) {
                const mounted = mountPath + prefix;
                router = endpoints[mounted];
                if (router) matchedKey = mounted;
            }

            if (router) {
                options?.onMatch?.(req, {
                    route: matchedKey,
                    method: req.method,
                    prefix,
                });
                return router(req, { params: { path: slug.slice(i) } });
            }
        }

        const fallbackPath = new URL(req.url).pathname;
        if (options?.onNotFound) {
            return options.onNotFound(req, {
                path: fallbackPath,
                method: req.method,
            });
        }
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    return {
        GET: handler,
        POST: handler,
        PUT: handler,
        PATCH: handler,
        DELETE: handler,
    } as const;
}
