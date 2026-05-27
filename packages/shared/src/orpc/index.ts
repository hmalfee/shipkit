import { oc } from '@orpc/contract';

import { auth } from './contract/auth';
import { todo } from './contract/todo';

export const contract = oc.router({
    auth,
    todo,
});

export type Contract = typeof contract;
