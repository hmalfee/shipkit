import { trace } from '@opentelemetry/api';

import { ALLOWED_HTTP_METHODS } from '@shipkit/shared/constants';

import type { NextRequest } from 'next/server';

export type RouteHandler = (
    req: NextRequest,
    context: { params?: { path?: string[] } | Promise<{ path?: string[] }> },
) => Response | Promise<Response>;

/** One of the allowlisted HTTP methods this router will dispatch. */
export type HttpMethod = (typeof ALLOWED_HTTP_METHODS)[number];

/**
 * Map of path → HTTP method → handler.
 *
 * Paths should start with `/`. Append `/*` to a path for wildcard
 * (prefix) matching — e.g. `"/otel/*"` matches `/otel/v1/traces`, etc.
 * Method keys must be one of `ALLOWED_HTTP_METHODS`.
 */
export type Routers = Record<string, Partial<Record<HttpMethod, RouteHandler>>>;

export interface CatchAllOptions {
    /**
     * Auto-detect the mount point from the request URL and also try
     * matching registered keys that include it.
     * e.g. mounted at /api → path "/api/otel" resolves as if registered as "/otel"
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

function fixSpan(route: string, method: string) {
    const span = trace.getActiveSpan();
    span?.setAttribute('http.route', route);
    span?.updateName(`${method} ${route}`);
}

/**
 * Validates every declared path/method combination up front, so a typo'd
 * method fails loudly at router-creation time rather than as a silent
 * 404 at request time. (TS callers also get this for free via excess
 * property checking on the object literal; this covers plain-JS callers too.)
 */
function validateEndpoints(endpoints: Routers): void {
    for (const [path, methods] of Object.entries(endpoints)) {
        if (!path.startsWith('/')) {
            throw new Error(
                `Invalid route path "${path}": path must start with "/".`,
            );
        }
        for (const method of Object.keys(methods ?? {})) {
            if (!ALLOWED_HTTP_METHODS.includes(method as HttpMethod)) {
                throw new Error(
                    `Invalid route method "${method}" for path "${path}". ` +
                        `Use one of ${ALLOWED_HTTP_METHODS.join(', ')}.`,
                );
            }
        }
    }
}

function resolveRoute(
    endpoints: Routers,
    method: string,
    path: string,
): { handler: RouteHandler; path: string } | undefined {
    const handler = endpoints[path]?.[method as HttpMethod];
    return handler ? { handler, path } : undefined;
}

/**
 * Creates a Next.js catch-all route handler that dispatches requests to
 * registered handlers based on the incoming URL path and HTTP method.
 *
 * Each path maps to an object of methods (one of `ALLOWED_HTTP_METHODS`).
 * Paths are **exact by default**; to match a path and all sub-paths
 * beneath it (e.g. a proxy), append `/*` to the path.
 *
 * ```ts
 * createCatchAllRouter({
 *   // exact — only matches GET /health
 *   '/health': { GET: healthHandler },
 *
 *   // multiple methods on one path
 *   '/users': { GET: listUsers, POST: createUser },
 *
 *   // wildcard — matches POST /otel/v1/traces, POST /otel/v1/logs, etc.
 *   // remaining segments are forwarded as `context.params.path`
 *   '/otel/*': { POST: otelProxyHandler },
 * })
 * ```
 *
 * Place this in `app/api/[...slug]/route.ts` and re-export the returned
 * `{ GET, POST, PUT, PATCH, DELETE }` object.
 *
 * @param endpoints - Map of path → method → handler. Paths should start
 *   with `/`. Append `/*` to a path for wildcard (prefix) matching.
 *   Malformed entries throw immediately.
 * @param options - Optional config: mount-prefix stripping and lifecycle hooks.
 */
export function createCatchAllRouter(
    endpoints: Routers,
    options?: CatchAllOptions,
) {
    validateEndpoints(endpoints);

    async function handler(
        req: NextRequest,
        { params }: { params: Promise<{ slug: string[] }> },
    ) {
        const { slug } = await params;
        const method = req.method;

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
        let match = resolveRoute(endpoints, method, exactPath);

        if (!match && mountPath) {
            match = resolveRoute(endpoints, method, mountPath + exactPath);
        }

        if (match) {
            fixSpan(match.path, method);
            options?.onMatch?.(req, {
                route: match.path,
                method,
                prefix: exactPath,
            });
            return match.handler(req, { params: { path: [] } });
        }

        // --- Phase 2: Wildcard match (longest prefix first) ---
        for (let i = slug.length - 1; i > 0; i--) {
            const prefix = '/' + slug.slice(0, i).join('/') + '/*';

            match = resolveRoute(endpoints, method, prefix);
            if (!match && mountPath) {
                match = resolveRoute(endpoints, method, mountPath + prefix);
            }

            if (match) {
                fixSpan(match.path, method);
                options?.onMatch?.(req, {
                    route: match.path,
                    method,
                    prefix,
                });
                return match.handler(req, { params: { path: slug.slice(i) } });
            }
        }

        const fallbackPath = new URL(req.url).pathname;
        fixSpan(fallbackPath, method);
        if (options?.onNotFound) {
            return options.onNotFound(req, {
                path: fallbackPath,
                method,
            });
        }
        return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Derived from ALLOWED_HTTP_METHODS rather than hardcoded, so this can never
    // drift out of sync with the allowlist.
    return Object.fromEntries(
        ALLOWED_HTTP_METHODS.map((method) => [method, handler]),
    ) as Record<HttpMethod, RouteHandler>;
}
