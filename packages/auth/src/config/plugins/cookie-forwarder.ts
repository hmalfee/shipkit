import { createAuthMiddleware } from 'better-auth/api';

import type { BetterAuthPlugin } from 'better-auth';

import { authRequestContext } from '../../context-store';

export function cookieForwarderPlugin(): BetterAuthPlugin {
    return {
        id: 'cookie-forwarder',
        hooks: {
            after: [
                {
                    matcher: () => true,
                    handler: createAuthMiddleware(async (ctx) => {
                        const store = authRequestContext.getStore();
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
