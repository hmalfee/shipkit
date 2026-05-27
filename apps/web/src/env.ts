import { z } from 'zod';

import { createEnv } from '@mento-mark/env/next';

export const env = createEnv({
    server: {
        WEB_PORT: z.coerce.number(),
        SERVER_PORT: z.coerce.number(),
    },
    client: {
        NEXT_PUBLIC_SERVER_URL: z.url(),
    },
    clientAccess: {
        NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
    },
});
