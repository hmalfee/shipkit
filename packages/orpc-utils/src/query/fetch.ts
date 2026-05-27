import { createORPCClient } from '@orpc/client';
import { OpenAPILink } from '@orpc/openapi-client/fetch';

import type { AnyContractRouter, ContractRouterClient } from '@orpc/contract';
import type { JsonifiedClient } from '@orpc/openapi-client';

export default function createFetchClient<TContract extends AnyContractRouter>(
    contract: TContract,
    options: {
        url: string;
        headers?: () =>
            | Record<string, string>
            | Promise<Record<string, string>>;
        fetch?: typeof fetch;
    },
) {
    const link = new OpenAPILink(contract, {
        url: options.url,
        headers: options.headers,
        fetch:
            options.fetch ??
            ((url, init) =>
                fetch(url, { credentials: 'same-origin', ...init })),
    });

    const client: JsonifiedClient<ContractRouterClient<TContract>> =
        createORPCClient(link);

    return client;
}
