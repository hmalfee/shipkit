import { z } from 'zod';

import { createEnv } from '@shipkit/env';

export const env = createEnv({
    server: {
        PORT: z.coerce.number(),
        SERVER_URL: z.url(),
        WEB_URL: z.url(),
        POSTGRES_URL: z.url(),
        REDIS_URL: z.url(),
        AUTH_SECRET: z.string(),
        USE_SECURE_AUTH_COOKIES: z.boolean().optional(),
        GOOGLE_CLIENT_ID: z.string(),
        GOOGLE_CLIENT_SECRET: z.string(),
        SMTP_HOST: z.string().optional(),
        SMTP_PORT: z.coerce.number().optional(),
        SMTP_USER: z.string().optional(),
        SMTP_PASSWORD: z.string().optional(),
        TRANSACTIONAL_SENDER: z
            .string()
            .refine((val) => /^.+ <[^\s@]+@[^\s@]+\.[^\s@]+>$/.test(val), {
                message: 'Must be in the format: Name <email@example.com>',
            })
            .optional(),
        OTEL_URL: z.url().optional(),
        CLIENT_IP_HEADER: z.string().optional(),
        /** Comma-separated IPs or CIDRs allowed to set CLIENT_IP_HEADER. */
        TRUSTED_PROXIES: z
            .string()
            .transform((s) =>
                s
                    .split(',')
                    .map((i) => i.trim())
                    .filter(Boolean),
            )
            .pipe(z.array(z.string().min(1)).min(1))
            .optional(),
    },
    rules: ({ ifValueThen, allOrNone, ifThen }) => [
        ifValueThen('NODE_ENV', 'production', ['OTEL_URL', 'CLIENT_IP_HEADER']),
        ifThen('CLIENT_IP_HEADER', ['TRUSTED_PROXIES']),
        allOrNone([
            'SMTP_HOST',
            'SMTP_PORT',
            'SMTP_USER',
            'SMTP_PASSWORD',
            'TRANSACTIONAL_SENDER',
        ]),
    ],
});
