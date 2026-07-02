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
    },
    clientAccess: {
        NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV,
        NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
    },
    rules: ({ ifValueThen, equalValues }) => [
        ifValueThen('NODE_ENV', 'production', ['OTEL_URL']),
        equalValues('NEXT_PUBLIC_ENV', 'NODE_ENV'),
    ],
});
