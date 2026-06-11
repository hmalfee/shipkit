import { z } from 'zod';

import { createEnv } from '@mento-mark/env';

export const env = createEnv({
    server: {
        USE_SECURE_COOKIES: z.boolean().default(false),
        GOOGLE_CLIENT_ID: z.string(),
        GOOGLE_CLIENT_SECRET: z.string(),
    },
});
