'use client';

import { isContractProcedure } from '@orpc/contract';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import {
    QueryClientProvider,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';

import type {
    AnyContractRouter,
    InferContractRouterErrorMap,
    ORPCErrorFromErrorMap,
    Schema,
} from '@orpc/contract';
import type {
    QueryClient,
    UseMutationOptions,
    UseMutationResult,
    UseQueryOptions,
    UseQueryResult,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ── Internal types ───────────────────────────────────────────────────

type ContractNode = Record<string, unknown>;

type WithInputSchema<T> = T extends { '~orpc': { inputSchema?: infer U } }
    ? [U] extends [Schema<unknown, unknown>]
        ? [Schema<unknown, unknown>] extends [U]
            ? Record<string, never>
            : { inputSchema: U }
        : { inputSchema: U }
    : Record<string, never>;

type MetaOf<T> = T extends { '~orpc': { meta?: infer U } } ? U : never;
type ProcedureType<T> = MetaOf<T> extends { type: infer U } ? U : never;

type ErrorOf<T> = T extends AnyContractRouter
    ? ORPCErrorFromErrorMap<InferContractRouterErrorMap<T>> | Error
    : Error;

// ── EnhancedClient type ──────────────────────────────────────────────

type EnhancedClient<TClient, TContract> = TClient extends (
    ...args: infer A
) => infer R
    ? TClient &
          (ProcedureType<TContract> extends 'query'
              ? WithInputSchema<TContract> & {
                    useQuery: (
                        ...args: A extends []
                            ? [
                                  opts?: Omit<
                                      UseQueryOptions<
                                          Awaited<R>,
                                          ErrorOf<TContract>
                                      >,
                                      'queryKey' | 'queryFn'
                                  >,
                              ]
                            : [
                                  input?: A[0],
                                  opts?: Omit<
                                      UseQueryOptions<
                                          Awaited<R>,
                                          ErrorOf<TContract>
                                      >,
                                      'queryKey' | 'queryFn'
                                  >,
                              ]
                    ) => UseQueryResult<Awaited<R>, ErrorOf<TContract>>;
                }
              : ProcedureType<TContract> extends 'mutation'
                ? WithInputSchema<TContract> & {
                      useMutation: (
                          opts?: Omit<
                              UseMutationOptions<
                                  Awaited<R>,
                                  ErrorOf<TContract>,
                                  A extends [] ? void : A[0]
                              >,
                              'mutationFn'
                          >,
                      ) => UseMutationResult<
                          Awaited<R>,
                          ErrorOf<TContract>,
                          A extends [] ? void : A[0]
                      >;
                  }
                : Record<string, never>)
    : {
          [K in keyof TClient & keyof TContract]: EnhancedClient<
              TClient[K],
              TContract[K]
          >;
      };

type IsMutation<T> = [ProcedureType<T>] extends ['mutation']
    ? ['mutation'] extends [ProcedureType<T>]
        ? true
        : false
    : false;

type UtilsClient<TClient, TContract> = TClient extends (
    ...args: infer A
) => infer R
    ? ProcedureType<TContract> extends 'query'
        ? {
              invalidateQuery: (
                  ...args: A extends [] ? [] : [input?: A[0]]
              ) => Promise<void>;
              setQueryData: (
                  ...args: A extends []
                      ? [
                            updater:
                                | Awaited<R>
                                | ((
                                      old: Awaited<R> | undefined,
                                  ) => Awaited<R> | undefined),
                        ]
                      : [
                            input: A[0],
                            updater:
                                | Awaited<R>
                                | ((
                                      old: Awaited<R> | undefined,
                                  ) => Awaited<R> | undefined),
                        ]
              ) => void;
          }
        : never
    : {
          invalidateQuery: () => Promise<void>;
      } & {
          [K in keyof TClient & keyof TContract as IsMutation<
              TContract[K]
          > extends true
              ? never
              : K]: UtilsClient<TClient[K], TContract[K]>;
      };

// ── Utils Proxy ──────────────────────────────────────────────────────

function buildUtilsProxy(
    contractNode: ContractNode,
    queryUtilsNode: Record<string, unknown>,
    queryClient: QueryClient,
): unknown {
    const cache = new Map<string, unknown>();

    return new Proxy(
        {},
        {
            get(_target, prop: string) {
                if (cache.has(prop)) return cache.get(prop);

                if (prop === 'invalidateQuery') {
                    const fn = async () => {
                        const keyFn = queryUtilsNode.key as
                            | (() => unknown[])
                            | undefined;
                        if (keyFn) {
                            await queryClient.invalidateQueries({
                                queryKey: keyFn(),
                            });
                        }
                    };
                    cache.set(prop, fn);
                    return fn;
                }

                const contractChild = contractNode[prop] as
                    | ContractNode
                    | undefined;
                const queryUtilsChild = queryUtilsNode[prop] as
                    | Record<string, unknown>
                    | undefined;

                if (!contractChild || !queryUtilsChild) return undefined;

                if (isContractProcedure(contractChild)) {
                    const meta = contractChild['~orpc'].meta as {
                        type: 'query' | 'mutation';
                    };

                    if (meta.type !== 'query') {
                        const empty = {};
                        cache.set(prop, empty);
                        return empty;
                    }

                    const utilsLeaf = {
                        invalidateQuery: async (input?: unknown) => {
                            const keyFn = queryUtilsChild.key as (opts: {
                                input?: unknown;
                            }) => unknown[];
                            await queryClient.invalidateQueries({
                                queryKey: keyFn({ input }),
                            });
                        },
                        setQueryData: (
                            inputOrUpdater: unknown,
                            maybeUpdater?: unknown,
                        ) => {
                            const hasInput = maybeUpdater !== undefined;
                            const input = hasInput ? inputOrUpdater : undefined;
                            const updater = hasInput
                                ? maybeUpdater
                                : inputOrUpdater;

                            const queryKeyFn =
                                queryUtilsChild.queryKey as (opts: {
                                    input?: unknown;
                                }) => unknown[];
                            queryClient.setQueryData(
                                queryKeyFn({ input }),
                                updater,
                            );
                        },
                    };

                    cache.set(prop, utilsLeaf);
                    return utilsLeaf;
                }

                if (
                    typeof contractChild === 'object' &&
                    contractChild !== null
                ) {
                    const node = buildUtilsProxy(
                        contractChild,
                        queryUtilsChild,
                        queryClient,
                    );
                    cache.set(prop, node);
                    return node;
                }

                return undefined;
            },
        },
    );
}

// ── enhance proxy ────────────────────────────────────────────────────

function enhance(
    clientNode: Record<string, unknown>,
    contractNode: ContractNode,
    queryUtilsNode: Record<string, unknown>,
): unknown {
    const cache = new Map<string, unknown>();

    return new Proxy(clientNode, {
        get(target, prop: string) {
            if (cache.has(prop)) return cache.get(prop);

            const clientChild = target[prop];
            const contractChild = contractNode[prop] as
                | ContractNode
                | undefined;
            const queryUtilsChild = queryUtilsNode[prop] as
                | Record<string, unknown>
                | undefined;

            if (clientChild === undefined) return undefined;

            if (
                typeof clientChild === 'function' &&
                contractChild &&
                isContractProcedure(contractChild)
            ) {
                const def = contractChild['~orpc'];
                const meta = def.meta as { type: 'query' | 'mutation' };

                const getQueryOpts = queryUtilsChild?.queryOptions as
                    | ((o: Record<string, unknown>) => UseQueryOptions)
                    | undefined;
                const getMutationOpts = queryUtilsChild?.mutationOptions as
                    | ((o?: Record<string, unknown>) => UseMutationOptions)
                    | undefined;

                const enhanced = Object.assign(
                    (...args: unknown[]) =>
                        (clientChild as (...a: unknown[]) => unknown)(...args),
                    {
                        ...(def.inputSchema
                            ? { inputSchema: def.inputSchema as unknown }
                            : {}),
                        ...(meta.type === 'query'
                            ? {
                                  useQuery: (
                                      input?: unknown,
                                      opts?: Record<string, unknown>,
                                  ) => {
                                      const mergedOpts =
                                          input !== undefined
                                              ? { input, ...opts }
                                              : (opts ?? {});
                                      return useQuery(
                                          getQueryOpts!(mergedOpts),
                                      );
                                  },
                              }
                            : {}),
                        ...(meta.type === 'mutation'
                            ? {
                                  useMutation: (
                                      opts?: Record<string, unknown>,
                                  ) => useMutation(getMutationOpts!(opts)),
                              }
                            : {}),
                    },
                );

                cache.set(prop, enhanced);
                return enhanced;
            }

            if (
                (typeof clientChild === 'object' ||
                    typeof clientChild === 'function') &&
                clientChild !== null
            ) {
                const node = enhance(
                    clientChild as Record<string, unknown>,
                    contractChild ?? {},
                    queryUtilsChild ?? {},
                );
                cache.set(prop, node);
                return node;
            }

            return clientChild;
        },
    });
}

// ── Factory ──────────────────────────────────────────────────────────

export function createQueryApi<
    TContract extends Record<string, unknown>,
    TClient extends Record<string, unknown>,
>(client: TClient, contract: TContract) {
    type API = EnhancedClient<TClient, TContract>;
    type Utils = UtilsClient<TClient, TContract>;

    const queryUtils = createTanstackQueryUtils(
        client as unknown as Parameters<typeof createTanstackQueryUtils>[0],
    );

    const api = enhance(
        client as unknown as Record<string, unknown>,
        contract as unknown as ContractNode,
        queryUtils as unknown as Record<string, unknown>,
    ) as API;

    // ── Provider ─────────────────────────────────────────────────────

    function APIProvider(props: {
        queryClient: QueryClient;
        children: ReactNode;
    }) {
        return (
            <QueryClientProvider client={props.queryClient}>
                {props.children}
            </QueryClientProvider>
        );
    }

    function useUtils(): Utils {
        const queryClient = useQueryClient();
        return buildUtilsProxy(
            contract as unknown as ContractNode,
            queryUtils as unknown as Record<string, unknown>,
            queryClient,
        ) as Utils;
    }

    return { api, useUtils, APIProvider };
}
