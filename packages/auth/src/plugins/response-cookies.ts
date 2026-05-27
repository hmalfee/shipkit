import { createAuthMiddleware } from 'better-auth/api';

import type { BetterAuthPlugin } from 'better-auth';

import { authStore } from '../store';

// ── Response-cookies plugin (must be last in plugins array) ──────────

export function responseCookies(): BetterAuthPlugin {
    return {
        id: 'response-cookies',
        hooks: {
            after: [
                {
                    matcher: () => true,
                    handler: createAuthMiddleware(async (ctx) => {
                        const store = authStore.getStore();
                        if (!store) return;

                        const headers = ctx.context.responseHeaders;
                        if (!(headers instanceof Headers)) return;

                        for (const cookie of headers.getSetCookie()) {
                            store.resHeaders.append('set-cookie', cookie);
                        }
                    }),
                },
            ],
        },
    };
}
