import { z } from 'zod';

import { createEnv } from '@mento-mark/env';

export const env = createEnv({
    server: {
        PORT: z.coerce.number(),
        WEB_PORT: z.coerce.number(),
        POSTGRES_URL: z.url(),
        REDIS_URL: z.url(),
        AUTH_SECRET: z.string(),
        USE_SECURE_AUTH_COOKIES: z.boolean().optional(),
        GOOGLE_CLIENT_ID: z.string(),
        GOOGLE_CLIENT_SECRET: z.string(),
        OTEL_URL: z.url().optional(),
    },
    rules: ({ ifValueThen }) => [
        ifValueThen('NODE_ENV', 'production', ['OTEL_URL']),
    ],
});
