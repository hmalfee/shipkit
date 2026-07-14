import { isContractProcedure } from '@orpc/contract';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { logger } from '@shipkit/telemetry/logger';

import type { FetchQueryOptions, QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ── Types ────────────────────────────────────────────────────────────

type ContractNode = Record<string, unknown>;

type ProcedureType<T> = T extends { '~orpc': { meta?: { type: infer U } } }
    ? U
    : never;

type IsMutation<T> = [ProcedureType<T>] extends ['mutation']
    ? ['mutation'] extends [ProcedureType<T>]
        ? true
        : false
    : false;

type ServerClient<TClient, TContract> = TClient extends (
    ...args: infer A
) => infer R
    ? ProcedureType<TContract> extends 'query'
        ? {
              prefetchQuery: undefined extends A[0]
                  ? {
                        (opts?: Record<string, unknown>): Promise<void>;
                        (
                            input: A[0],
                            opts?: Record<string, unknown>,
                        ): Promise<void>;
                    }
                  : (
                        input: A[0],
                        opts?: Record<string, unknown>,
                    ) => Promise<void>;
              setQueryData: undefined extends A[0]
                  ? {
                        (data: Awaited<R>): void;
                        (input: A[0], data: Awaited<R>): void;
                    }
                  : (input: A[0], data: Awaited<R>) => void;
          }
        : never
    : {
          [
              K in keyof TClient & keyof TContract as IsMutation<
                  TContract[K]
              > extends true
                  ? never
                  : K
          ]: ServerClient<TClient[K], TContract[K]>;
      };

// ── Factory ──────────────────────────────────────────────────────────

export function createSSRHelpers<
    TContract extends Record<string, unknown>,
    TClient extends Record<string, unknown>,
>(client: TClient, contract: TContract, getQueryClient: () => QueryClient) {
    const queryUtils = createTanstackQueryUtils(
        client as unknown as Parameters<typeof createTanstackQueryUtils>[0],
    ) as unknown as Record<string, unknown>;

    function buildProxy(
        contractNode: ContractNode,
        queryUtilsNode: Record<string, unknown>,
    ): unknown {
        const proxyCache = new Map<string, unknown>();

        return new Proxy(
            {},
            {
                get(target, prop: string) {
                    if (proxyCache.has(prop)) return proxyCache.get(prop);
                    if (Reflect.has(target, prop))
                        return Reflect.get(target, prop) as unknown;

                    const contractChild = contractNode[prop] as
                        ContractNode | undefined;
                    const queryUtilsChild = queryUtilsNode[prop] as
                        Record<string, unknown> | undefined;

                    if (!contractChild) return undefined;

                    if (isContractProcedure(contractChild)) {
                        const meta = contractChild['~orpc'].meta as {
                            type: 'query' | 'mutation';
                        };
                        const getQueryOpts = queryUtilsChild?.queryOptions as
                            | ((
                                  o: Record<string, unknown>,
                              ) => FetchQueryOptions)
                            | undefined;

                        if (meta.type !== 'query') {
                            proxyCache.set(prop, {} as Record<string, never>);
                            return {} as Record<string, never>;
                        }

                        const leaf = {
                            prefetchQuery: async (...args: unknown[]) => {
                                if (!getQueryOpts) return;
                                const qc = getQueryClient();
                                const hasInput =
                                    contractChild['~orpc'].inputSchema !==
                                    undefined;
                                let input: unknown;
                                let opts: Record<string, unknown> | undefined;

                                if (hasInput) {
                                    input = args[0];
                                    opts = args[1] as
                                        Record<string, unknown> | undefined;
                                } else {
                                    opts = args[0] as
                                        Record<string, unknown> | undefined;
                                }

                                const mergedOpts =
                                    input !== undefined
                                        ? { input, ...opts }
                                        : (opts ?? {});
                                const queryOpts = getQueryOpts(mergedOpts);
                                await qc.prefetchQuery(queryOpts);

                                // In SSR, prefetchQuery swallows errors to allow client fallback.
                                // We explicitly log them here for better debugging.
                                const state = qc.getQueryCache().find({
                                    queryKey: queryOpts.queryKey,
                                })?.state;
                                if (state?.status === 'error') {
                                    if (
                                        state.error &&
                                        typeof state.error === 'object' &&
                                        'digest' in state.error &&
                                        state.error.digest ===
                                            'DYNAMIC_SERVER_USAGE'
                                    ) {
                                        throw state.error;
                                    }

                                    logger.error(
                                        `[SSR Prefetch Error] Query ${JSON.stringify(queryOpts.queryKey)} failed:`,
                                        { error: state.error },
                                    );
                                }
                            },
                            setQueryData: (...args: unknown[]) => {
                                const hasInput =
                                    contractChild['~orpc'].inputSchema !==
                                    undefined;
                                let input: unknown;
                                let data: unknown;
                                if (hasInput) {
                                    input = args[0];
                                    data = args[1];
                                } else {
                                    data = args[0];
                                }

                                const queryKeyFn = queryUtilsChild?.queryKey as
                                    | ((opts: { input?: unknown }) => unknown[])
                                    | undefined;
                                if (!queryKeyFn) return;

                                const qc = getQueryClient();
                                qc.setQueryData(queryKeyFn({ input }), data);
                            },
                        };
                        proxyCache.set(prop, leaf);
                        return leaf;
                    }

                    const child = buildProxy(
                        contractChild,
                        queryUtilsChild ?? {},
                    );
                    proxyCache.set(prop, child);
                    return child;
                },
            },
        );
    }

    const api = buildProxy(
        contract as unknown as ContractNode,
        queryUtils,
    ) as ServerClient<TClient, TContract>;

    function HydrateClient({ children }: { children: ReactNode }) {
        const state = dehydrate(getQueryClient());
        return <HydrationBoundary state={state}>{children}</HydrationBoundary>;
    }

    return Object.assign(api, { HydrateClient }) as ServerClient<
        TClient,
        TContract
    > & {
        HydrateClient: (props: { children: ReactNode }) => ReactNode;
    };
}
