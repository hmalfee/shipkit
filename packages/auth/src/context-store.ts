import { AsyncLocalStorage } from 'node:async_hooks';

export interface AuthRequestContext {
    resHeaders: Headers;
}

export const authRequestContext = new AsyncLocalStorage<AuthRequestContext>();
