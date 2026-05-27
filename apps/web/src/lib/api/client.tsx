'use client';

import { createFetchClient } from '@mento-mark/orpc-utils/query';
import { createQueryApi } from '@mento-mark/orpc-utils/query/react';
import { contract } from '@mento-mark/shared/orpc';

import { env } from '@/env';

const fetchApi = createFetchClient(contract, {
    url: env.NEXT_PUBLIC_SERVER_URL,
    fetch: (url, init) => fetch(url, { credentials: 'include', ...init }),
});

export const { api, APIProvider, useUtils } = createQueryApi(
    fetchApi,
    contract,
);
