import { ContractProcedure, isContractProcedure, oc } from '@orpc/contract';

import type { AnyContractRouter } from '@orpc/contract';

function normalizePath(path: string): `/${string}` {
    const collapsed = path.replace(/\/{2,}/g, '/');
    return (
        collapsed.length > 1 ? collapsed.replace(/\/$/, '') : collapsed
    ) as `/${string}`;
}

/** Private. Rewrites every procedure path in a router. Idempotent. */
function normalizeRouter<T extends AnyContractRouter>(router: T): T {
    if (isContractProcedure(router)) {
        const def = router['~orpc'];
        const path = def.route.path;
        if (typeof path !== 'string') return router;
        const next = normalizePath(path);
        if (next === path) return router;
        return new ContractProcedure({
            ...def,
            route: { ...def.route, path: next },
        }) as unknown as T;
    }
    return Object.fromEntries(
        Object.entries(router).map(([k, child]) => [
            k,
            normalizeRouter(child as AnyContractRouter),
        ]),
    ) as T;
}

type RouteInfo = { trail: string; method: string; path: string };

function collectRoutes(
    router: AnyContractRouter,
    trail: string[] = [],
): RouteInfo[] {
    if (isContractProcedure(router)) {
        const { method, path } = router['~orpc'].route;
        return path
            ? [{ trail: trail.join('.'), method: method ?? 'POST', path }]
            : [];
    }
    return Object.entries(router).flatMap(([k, child]) =>
        collectRoutes(child as AnyContractRouter, [...trail, k]),
    );
}

function assertNoDuplicateRoutes(router: AnyContractRouter): void {
    const seen = new Map<string, string>();
    for (const r of collectRoutes(router)) {
        const key = `${r.method} ${r.path}`;
        const prev = seen.get(key);
        if (prev) {
            throw new Error(
                `[orpc-utils] Duplicate route "${key}" (${prev} and ${r.trail})`,
            );
        }
        seen.set(key, r.trail);
    }
}

/** Replaces `oc.prefix(prefix).router(routes)`. */
export function group<T extends AnyContractRouter>(
    prefix: `/${string}`,
    routes: T,
) {
    return normalizeRouter(oc.prefix(prefix).router(routes));
}

/** Replaces `oc.router(routes)`. Use once, at the root. */
export function defineContract<T extends AnyContractRouter>(routes: T) {
    const contract = normalizeRouter(oc.router(routes));
    assertNoDuplicateRoutes(contract);
    return contract;
}
