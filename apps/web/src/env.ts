import { z } from 'zod';

import { createEnv } from '@shipkit/env';

process.env.NEXT_PUBLIC_ENV = process.env.NODE_ENV;
process.env.NEXT_PUBLIC_SERVER_URL = process.env.SERVER_URL;

export const env = createEnv({
    server: {
        PORT: z.coerce.number(),
        INTERNAL_SERVER_URL: z.url(),
        OTEL_URL: z.url().optional(),
    },
    clientPrefix: 'NEXT_PUBLIC_',
    client: {
        NEXT_PUBLIC_ENV: z.enum(['development', 'production', 'test']),
        NEXT_PUBLIC_SERVER_URL: z.url(),
        NEXT_PUBLIC_OTEL_PROXY_PATH: z.string().startsWith('/api/').optional(),
        NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
        NEXT_PUBLIC_POSTHOG_PROXY_PATH: z.string().startsWith('/').optional(),
    },
    clientAccess: {
        NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV,
        NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
        NEXT_PUBLIC_OTEL_PROXY_PATH: process.env.NEXT_PUBLIC_OTEL_PROXY_PATH,
        NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        NEXT_PUBLIC_POSTHOG_PROXY_PATH:
            process.env.NEXT_PUBLIC_POSTHOG_PROXY_PATH,
    },
    rules: ({ ifValueThen, equalValues, allOrNone }) => [
        ifValueThen('NODE_ENV', 'production', [
            'OTEL_URL',
            'NEXT_PUBLIC_POSTHOG_KEY',
        ]),
        equalValues('NEXT_PUBLIC_ENV', 'NODE_ENV'),
        allOrNone(['NEXT_PUBLIC_OTEL_PROXY_PATH', 'OTEL_URL']),
        allOrNone([
            'NEXT_PUBLIC_POSTHOG_PROXY_PATH',
            'NEXT_PUBLIC_POSTHOG_KEY',
        ]),
    ],
});
