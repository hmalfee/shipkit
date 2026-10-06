import 'server-only';

import { cache } from 'react';

import { createSSRHelpers } from '@shipkit/orpc-utils/query/react';
import { contract } from '@shipkit/shared/orpc-contract';

import { createQueryClient } from './query-client';
import { rpc } from './rpc';

const getQueryClient = cache(() => createQueryClient());

/**
 * Server-only helpers for prefetching into the React Query cache and
 * hydrating it on the client, built on top of `rpc`.
 */
export const ssr = createSSRHelpers(rpc, contract, getQueryClient);
