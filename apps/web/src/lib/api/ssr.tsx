import 'server-only';

import { cookies } from 'next/headers';
import { cache } from 'react';

import { createFetchClient } from '@shipkit/orpc-utils/query';
import { createSSRHelpers } from '@shipkit/orpc-utils/query/react';
import { contract } from '@shipkit/shared/orpc';

import { env } from '@/env';

import { createQueryClient } from './query-client';

const getQueryClient = cache(() => createQueryClient());

const serverApi = createFetchClient(contract, {
    url: env.INTERNAL_SERVER_URL,
    headers: async () => {
        const cookieStore = await cookies();
        return { cookie: cookieStore.toString() };
    },
});

export const ssr = createSSRHelpers(serverApi, contract, getQueryClient);
