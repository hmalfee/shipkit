import {
    defaultShouldDehydrateQuery,
    QueryClient,
} from '@tanstack/react-query';

export const createQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: Infinity,
                gcTime: Infinity,
            },
            dehydrate: {
                shouldDehydrateQuery: (query) =>
                    defaultShouldDehydrateQuery(query) ||
                    query.state.status === 'pending',
            },
        },
    });
