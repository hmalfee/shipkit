import 'server-only';

import { cookies } from 'next/headers';
import { cache } from 'react';

import { createFetchClient } from '@mento-mark/orpc-utils/query';
import { createSSRHelpers } from '@mento-mark/orpc-utils/query/react';
import { contract } from '@mento-mark/shared/orpc';

import { env } from '@/env';

import { createQueryClient } from './query-client';

const getQueryClient = cache(() => createQueryClient());

const serverApi = createFetchClient(contract, {
    url: `http://localhost:${env.SERVER_PORT}/`,
    headers: async () => {
        const cookieStore = await cookies();
        return { cookie: cookieStore.toString() };
    },
});

export const ssr = createSSRHelpers(serverApi, contract, getQueryClient);
