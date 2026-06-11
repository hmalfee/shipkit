import { z } from 'zod';

import { createEnv } from '@mento-mark/env';

export const env = createEnv({
    server: {
        OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
    },
});
