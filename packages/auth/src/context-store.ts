import { AsyncLocalStorage } from 'node:async_hooks';

interface AuthRequestContext {
    resHeaders: Headers;
    /**
     * One-shot handoff for the `displayEmail` additional field during OAuth user creation.
     *
     * **Why this exists:**
     * `displayEmail` is declared with `input: false`, which prevents SDK consumers from
     * setting/updating it directly. The side-effect is that better-auth's
     * `parseAdditionalUserInputFromProviderProfile` silently drops any `displayEmail`
     * value returned by `mapOAuthProfileEmail`.
     *
     * We can't use `input: true` either — that would let SDK consumers set `displayEmail`
     * to an arbitrary value during sign-up or profile update.
     *
     * **The handoff:**
     * `mapOAuthProfileEmail` stashes the value here. The field's `defaultValue()` then
     * consumes and returns it as the field value in the same request context.
     */
    pendingDisplayEmail?: string;
}

export const authRequestContext = new AsyncLocalStorage<AuthRequestContext>();
