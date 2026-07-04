import { z } from 'zod';

import { createEnv } from '@mento-mark/env';

export const env = createEnv({
    server: {
        PORT: z.coerce.number(),
        SERVER_PORT: z.coerce.number(),
        OTEL_URL: z.url().optional(),
    },
    clientPrefix: 'NEXT_PUBLIC_',
    client: {
        NEXT_PUBLIC_ENV: z.enum(['development', 'production', 'test']),
        NEXT_PUBLIC_SERVER_URL: z.url(),
        NEXT_PUBLIC_OTEL_PROXY_PATH: z.string().startsWith('/').optional(),
    },
    clientAccess: {
        NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV,
        NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
        NEXT_PUBLIC_OTEL_PROXY_PATH: process.env.NEXT_PUBLIC_OTEL_PROXY_PATH,
    },
    rules: ({ ifValueThen, equalValues, allOrNone }) => [
        ifValueThen('NODE_ENV', 'production', ['OTEL_URL']),
        equalValues('NEXT_PUBLIC_ENV', 'NODE_ENV'),
        allOrNone(['NEXT_PUBLIC_OTEL_PROXY_PATH', 'OTEL_URL']),
    ],
});
