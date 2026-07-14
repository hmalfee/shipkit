import {
    defaultShouldDehydrateQuery,
    MutationCache,
    QueryCache,
    QueryClient,
} from '@tanstack/react-query';
import { Loader } from 'lucide-react';
import { createElement } from 'react';
import { toast } from 'sonner';

import { isDefinedError, ORPCError } from '@shipkit/orpc-utils/query';

export const isOffline = (e: Error) =>
    (typeof navigator !== 'undefined' && !navigator.onLine) ||
    (e.cause instanceof Error && e.cause.message.includes('ENETUNREACH'));

export const isServerDown = (e: Error) =>
    !isOffline(e) &&
    ((e.cause instanceof Error &&
        /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET/.test(e.cause.message)) ||
        (e instanceof TypeError &&
            e.name !== 'AbortError' &&
            /failed to fetch|fetch failed|network error|networkerror|load failed/i.test(
                e.message,
            )));

const isDefinedORPCError = (e: Error): e is ORPCError<string, unknown> =>
    e instanceof ORPCError && isDefinedError(e);

const handleError = (e: Error, showToast: boolean) => {
    if (typeof window === 'undefined') return;

    // Error boundary handles offline errors.
    if (isOffline(e)) return;

    // For mutations: server-down toast gives feedback since mutations don't retry.
    // For queries: fires after 20 retries exhaust, right before error boundary takes over.
    // Either way, dismiss the persistent retry toast — it's no longer retrying.
    if (isServerDown(e)) {
        toast.dismiss('server-error');
        toast.error('Could not reach the server. Try again later.');
        return;
    }

    if (showToast)
        toast.error(
            isDefinedORPCError(e) ? e.message : 'An unexpected error occurred.',
        );
};

export const createQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: Infinity,
                gcTime: Infinity,
                // Offline throws to error boundary immediately. Server-down throws after retries exhaust.
                throwOnError: (e) => !isDefinedORPCError(e),
                retry: (count, e) => {
                    if (isDefinedORPCError(e) || isOffline(e)) return false;

                    if (isServerDown(e)) {
                        if (count === 0 && typeof window !== 'undefined') {
                            toast.error(
                                'Service is currently unreachable. Retrying...',
                                {
                                    id: 'server-error',
                                    duration: Infinity,
                                    dismissible: false,
                                    position: 'top-right',
                                    icon: createElement(Loader, {
                                        className: 'animate-spin',
                                        size: 16,
                                    }),
                                },
                            );
                        }
                        return count < 20; // ~8 min of retrying, then hard fail to error boundary
                    }
                    return count < 2;
                },
                // Exponential backoff capped at 30s
                retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
                refetchOnWindowFocus: false,
            },
            mutations: {
                // Offline throws to error boundary. Server down suppressed (retry handles it).
                throwOnError: (e) =>
                    isOffline(e) ||
                    (!isDefinedORPCError(e) && !isServerDown(e)),
            },
            dehydrate: {
                shouldDehydrateQuery: (q) =>
                    defaultShouldDehydrateQuery(q) ||
                    q.state.status === 'pending',
            },
        },
        mutationCache: new MutationCache({
            onError: (e, _vars, _ctx, mutation) =>
                handleError(e, !mutation.meta?.skipErrorToast),
        }),
        queryCache: new QueryCache({
            // Dismiss persistent server-down toast when any query succeeds
            onSuccess: () => {
                if (typeof window !== 'undefined')
                    toast.dismiss('server-error');
            },
            onError: (e, query) => handleError(e, !!query.meta?.showErrorToast),
        }),
    });

declare module '@tanstack/react-query' {
    interface Register {
        queryMeta: {
            /** Show a global error toast on failure. Network errors always toast.
             *  @default false */
            showErrorToast?: boolean;
        };
        mutationMeta: {
            /** Suppress the global error toast. Network errors always toast.
             *  @default false */
            skipErrorToast?: boolean;
        };
    }
}
