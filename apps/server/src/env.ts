import { z } from 'zod';

import { createEnv } from '@mento-mark/env';

export const env = createEnv({
    server: {
        SERVER_PORT: z.coerce.number(),
        WEB_PORT: z.coerce.number(),
    },
});
