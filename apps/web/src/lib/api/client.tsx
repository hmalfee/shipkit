'use client';

import { createQueryApi } from '@shipkit/orpc-utils/query/react';
import { contract } from '@shipkit/shared/orpc-contract';

import { rpc } from './rpc';

/**
 * Client-side React Query layer built on top of `rpc`.
 */
export const { api, APIProvider, useUtils } = createQueryApi(rpc, contract);
