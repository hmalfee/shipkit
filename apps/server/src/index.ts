import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { logger } from '@mento-mark/telemetry/logger';
import { traceHonoRequest } from '@mento-mark/telemetry/node/hono';

import { orpc } from './api/handler';
import { env } from './env';

const app = new Hono();

// safety net: all orpc errors are handled by orpc internally
app.onError((err, c) => {
    logger.error('Unhandled error escaped all middlewares', { error: err });
    return c.json(
        {
            error:
                env.NODE_ENV === 'production'
                    ? 'Internal Server Error'
                    : err.message,
        },
        500,
    );
});

app.use(traceHonoRequest());
app.use(
    '/*',
    cors({
        origin: [`http://localhost:${env.WEB_PORT}`],
        allowMethods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
        allowHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    }),
);
// Make sure this is the last middleware, as it will handle all requests that reach this point
app.use('/*', orpc());

serve(
    {
        fetch: app.fetch,
        port: env.PORT,
    },
    (info) => {
        logger.info(`Server is running on http://localhost:${info.port}`, {
            forceConsole: true,
        });
    },
);
