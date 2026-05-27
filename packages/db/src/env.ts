import { z } from 'zod';

import { createEnv } from '@mento-mark/env/base';

export const env = createEnv({
    server: {
        POSTGRES_URL: z.string().min(1),
        REDIS_URL: z.string().min(1),
    },
});
