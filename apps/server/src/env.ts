import { z } from 'zod';

import { createEnv } from '@mento-mark/env';

export const env = createEnv({
    server: {
        // Server
        SERVER_PORT: z.coerce.number(),
        WEB_PORT: z.coerce.number(),

        // Database
        POSTGRES_URL: z.url(),
        REDIS_URL: z.url(),

        // Auth
        AUTH_SECRET: z.string(),
        USE_SECURE_AUTH_COOKIES: z.boolean().optional(),
        GOOGLE_CLIENT_ID: z.string(),
        GOOGLE_CLIENT_SECRET: z.string(),

        // Telemetry
        OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
    },
});
