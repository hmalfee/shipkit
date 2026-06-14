import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { logger } from '@mento-mark/telemetry/logger';
import { telemetry } from '@mento-mark/telemetry/middleware/hono';

import { orpc } from './api/handler';
import { env } from './env';

const app = new Hono();

const allowedOrigins = Array.from(
    Object.entries(env).filter(([key]) => key.endsWith('_PORT')),
    ([, port]) => `http://localhost:${port as number}`,
);

app.use(telemetry());
app.use(
    '/*',
    cors({
        origin: allowedOrigins,
        allowMethods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
        allowHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    }),
);

app.use('*', orpc());

serve(
    {
        fetch: app.fetch,
        port: env.PORT,
    },
    (info) => {
        logger.info(`Server is running on http://localhost:${info.port}`);
    },
);
