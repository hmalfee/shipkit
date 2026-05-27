import { AsyncLocalStorage } from 'node:async_hooks';

export interface AuthStore {
    resHeaders: Headers;
}

export const authStore = new AsyncLocalStorage<AuthStore>();
