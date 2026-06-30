import { AsyncLocalStorage } from 'node:async_hooks';

interface AuthRequestContext {
    resHeaders: Headers;
}

export const authRequestContext = new AsyncLocalStorage<AuthRequestContext>();
