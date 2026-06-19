import { z } from 'zod';

import { createEnv } from '@mento-mark/env';

export const env = createEnv({
    server: {
        PORT: z.coerce.number(),
        SERVER_PORT: z.coerce.number(),

        // Sentry
        SENTRY_ORG: z.string().min(1).optional(),
        SENTRY_PROJECT: z.string().min(1).optional(),
        SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
        SENTRY_URL: z.url().optional(),
        SENTRY_RELEASE: z.string().min(1).optional(),
    },
    client: {
        NEXT_PUBLIC_ENV: z
            .enum(['development', 'production', 'test'])
            .default('development'),
        NEXT_PUBLIC_SERVER_URL: z.url(),
        NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
    },
    clientPrefix: 'NEXT_PUBLIC_',
    clientAccess: {
        NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV,
        NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
        NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    },
    rules: ({ allOrNone }) => [
        allOrNone([
            'NEXT_PUBLIC_SENTRY_DSN',
            'SENTRY_AUTH_TOKEN',
            'SENTRY_ORG',
            'SENTRY_PROJECT',
            'SENTRY_URL',
            'SENTRY_RELEASE',
        ]),
    ],
});
