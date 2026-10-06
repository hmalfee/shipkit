import { defineContract } from '@shipkit/orpc-utils/contract';

import { auth } from './auth';
import { todo } from './todo';

export const contract = defineContract({
    auth,
    todo,
});

export type Contract = typeof contract;
