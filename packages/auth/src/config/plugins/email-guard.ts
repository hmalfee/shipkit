import { createAuthMiddleware } from 'better-auth/api';
import { z } from 'zod/mini';

import type { BetterAuthPlugin } from 'better-auth';

import {
    assertNotDisposable,
    normalizeEmail,
    sanitizeEmail,
} from '../utils/email-validation';

function compileMatcher(pattern: string): (path: string) => boolean {
    if (pattern.endsWith('/**')) {
        const prefix = pattern.slice(0, -3);
        return (path) => path === prefix || path.startsWith(prefix + '/');
    }
    if (pattern.endsWith('/*')) {
        const prefix = pattern.slice(0, -2);
        return (path) =>
            path.startsWith(prefix + '/') &&
            !path.slice(prefix.length + 1).includes('/');
    }
    return (path) => path === pattern;
}

export type EmailGuardOptions = {
    /**
     * Paths to guard. Supports glob wildcards:
     * `/email/*` (single segment), `/email/**` (full).
     *
     * For each matched request the handler checks `body.email`, then
     * `body.newEmail`; requests with neither are ignored.
     */
    paths: string[];
};

export function emailGuardPlugin(options: EmailGuardOptions): BetterAuthPlugin {
    const compiledMatchers = options.paths.map(compileMatcher);

    return {
        id: 'email-guard',
        hooks: {
            before: [
                {
                    matcher: (ctx) => {
                        const path = ctx.path;
                        if (!path) return false;
                        return compiledMatchers.some((m) => m(path));
                    },
                    handler: createAuthMiddleware(async (ctx) => {
                        const body = ctx.body as
                            Record<string, unknown> | undefined;
                        const emailKey =
                            body && 'email' in body ? 'email' : 'newEmail';
                        const rawEmail = body?.[emailKey];

                        if (!rawEmail || typeof rawEmail !== 'string') return;

                        const originalEmail = sanitizeEmail(rawEmail);

                        if (!z.email().safeParse(originalEmail).success) return;

                        const normalizedEmail = normalizeEmail(originalEmail);

                        await assertNotDisposable(
                            originalEmail,
                            normalizedEmail,
                            ctx.context.internalAdapter,
                        );

                        if (normalizedEmail !== originalEmail) {
                            return {
                                context: {
                                    ...ctx,
                                    body: {
                                        ...body,
                                        [emailKey]: normalizedEmail,
                                    },
                                },
                            };
                        }
                    }),
                },
            ],
        },
    } satisfies BetterAuthPlugin;
}
