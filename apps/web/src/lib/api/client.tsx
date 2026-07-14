'use client';

import { createFetchClient } from '@shipkit/orpc-utils/query';
import { createQueryApi } from '@shipkit/orpc-utils/query/react';
import { contract } from '@shipkit/shared/orpc';

import { env } from '@/env';

const fetchApi = createFetchClient(contract, {
    url: env.NEXT_PUBLIC_SERVER_URL,
    fetch: (url, init) => fetch(url, { credentials: 'include', ...init }),
});

export const { api, APIProvider, useUtils } = createQueryApi(
    fetchApi,
    contract,
);
