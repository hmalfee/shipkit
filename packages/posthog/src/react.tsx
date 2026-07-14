'use client';

import { hashKey, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { posthog } from '@shipkit/posthog';

import type { QueryKey } from '@tanstack/react-query';

type Primitive =
    string | number | boolean | bigint | symbol | undefined | null | Date;

// depth limiter to avoid TS "excessively deep" errors on recursive/large types
type Prev = [never, 0, 1, 2, 3, 4, 5];

type PathImpl<T, K extends keyof T, D extends number> = K extends string
    ? NonNullable<T[K]> extends Primitive
        ? K
        : NonNullable<T[K]> extends Array<unknown>
          ? K
          : D extends 0
            ? K
            : NonNullable<T[K]> extends object
              ? | K
                | `${K}.${PathImpl<NonNullable<T[K]>, keyof NonNullable<T[K]>, Prev[D]>}`
              : K
    : never;

type Path<T, D extends number = 5> = T extends object
    ? PathImpl<T, keyof T, D>
    : never;

type PathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
    ? K extends keyof NonNullable<T>
        ? PathValue<NonNullable<T>[K], Rest>
        : never
    : P extends keyof NonNullable<T>
      ? NonNullable<T>[P]
      : never;

// only expose paths whose resolved value can act as an identifier (string)
type IdentifierPath<T> = {
    [P in Path<T>]: PathValue<T, P> extends string | undefined | null
        ? P
        : never;
}[Path<T>];

function getByPath(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
        if (acc === null || acc === undefined) return undefined;
        return (acc as Record<string, unknown>)[key];
    }, obj);
}

type QueryIdentitySyncProps<TData> = {
    queryKey: QueryKey;
    identifierAccessor: IdentifierPath<TData>;
};

/**
 * Watches a React Query cache entry and syncs identity to PostHog on changes.
 * Must be rendered within a QueryClientProvider.
 */
export function QueryIdentitySync<TData>({
    queryKey,
    identifierAccessor,
}: QueryIdentitySyncProps<TData>) {
    const queryClient = useQueryClient();
    const queryHash = useMemo(() => hashKey(queryKey), [queryKey]);

    useEffect(() => {
        function sync(data: TData | undefined) {
            const userId = getByPath(data, identifierAccessor) as
                string | undefined;
            const currentDistinctId = posthog.get_distinct_id();

            if (userId) {
                if (currentDistinctId !== userId) {
                    if (posthog._isIdentified()) posthog.reset();
                    posthog.identify(userId);
                }
            } else if (posthog._isIdentified()) {
                posthog.reset();
            }
        }

        const cached = queryClient.getQueryCache().get(queryHash);
        if (cached?.state.status === 'success') {
            sync(cached.state.data as TData | undefined);
        }

        const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
            if (
                event.type === 'updated' &&
                event.action.type === 'success' &&
                event.query.queryHash === queryHash
            ) {
                sync(event.query.state.data as TData);
            }
        });
        return () => unsubscribe();
    }, [queryHash, identifierAccessor, queryClient]);

    return null;
}

export function createQueryIdentitySync<TData>() {
    return function BoundQueryIdentitySync(
        props: QueryIdentitySyncProps<TData>,
    ) {
        return <QueryIdentitySync<TData> {...props} />;
    };
}
