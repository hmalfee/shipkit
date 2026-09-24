import { AsyncLocalStorage } from 'node:async_hooks';

interface AuthRequestContext {
    resHeaders: Headers;
    /**
     * One-shot slot that carries the display email from `mapOAuthProfileEmail`
     * to `getPendingDisplayEmail` during OAuth user creation, so `displayEmail`
     * can be populated without being user-settable. Cleared when read.
     */
    pendingDisplayEmail?: string;
}

export const authRequestContext = new AsyncLocalStorage<AuthRequestContext>();
