import { SmartCoercionPlugin } from '@orpc/json-schema';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { onError, ORPCError, ValidationError } from '@orpc/server';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import z from 'zod';

import { createAuth } from '@shipkit/auth';
import { createDb } from '@shipkit/db/pg';
import { createRedisClient } from '@shipkit/db/redis';
import { logger } from '@shipkit/telemetry/logger';

import { env } from '@/env';

import type { MiddlewareHandler } from 'hono';

import { router } from './router';

const db = createDb(env.POSTGRES_URL);
const redis = createRedisClient(env.REDIS_URL);

const createHandler = async () => {
    const plugins = [
        new SmartCoercionPlugin({
            schemaConverters: [new ZodToJsonSchemaConverter()],
        }),
    ];

    if (env.NODE_ENV === 'development') {
        const { OpenAPIReferencePlugin } =
            await import('@orpc/openapi/plugins');
        plugins.push(
            new OpenAPIReferencePlugin({
                schemaConverters: [new ZodToJsonSchemaConverter()],
                specGenerateOptions: {
                    info: {
                        title: 'shipkit API',
                        version: '1.0.0',
                    },
                },
            }) as never,
        );
    }

    return new OpenAPIHandler(router, {
        plugins: plugins as never,
        clientInterceptors: [
            onError((error) => {
                if (
                    error instanceof ORPCError &&
                    error.code === 'BAD_REQUEST' &&
                    error.cause instanceof ValidationError
                ) {
                    const zodError = new z.ZodError(
                        error.cause.issues as z.core.$ZodIssue[],
                    );
                    // oxlint-disable-next-line eslint-js/no-restricted-syntax
                    throw new ORPCError('BAD_REQUEST', {
                        message: z.prettifyError(zodError),
                        data: z.flattenError(zodError),
                    });
                }
            }),
        ],
        interceptors: [
            onError((error) => {
                const isInternal =
                    !(error instanceof ORPCError) || error.status === 500;

                if (isInternal) {
                    const cause =
                        error instanceof ORPCError
                            ? (error.cause ?? error)
                            : error;
                    logger.error('[oRPC] Internal Server Error', {
                        error: cause,
                    });
                }
            }),
        ],
    });
};

let handler: Awaited<ReturnType<typeof createHandler>> | undefined;

export const orpc = (): MiddlewareHandler => async (c) => {
    handler ??= await createHandler();

    const resHeaders = new Headers();

    const { matched, response } = await handler.handle(c.req.raw, {
        context: {
            reqHeaders: c.req.raw.headers,
            resHeaders,
            auth: createAuth({
                headers: { request: c.req.raw.headers, response: resHeaders },
                storage: { database: db, sessionCache: redis },
                baseURL: env.SERVER_URL,
                config: {
                    secret: env.AUTH_SECRET,
                    useSecureCookies: env.USE_SECURE_AUTH_COOKIES ?? false,
                    oauth: {
                        google: {
                            clientId: env.GOOGLE_CLIENT_ID,
                            clientSecret: env.GOOGLE_CLIENT_SECRET,
                        },
                    },
                },
            }),
            db,
            redis,
            logger,
        },
    });

    if (matched) {
        const finalResponse = c.newResponse(response.body, response);
        resHeaders.forEach((value, key) => {
            finalResponse.headers.append(key, value);
        });
        return finalResponse;
    }

    const error = new ORPCError('NOT_FOUND', {
        message: `Route ${c.req.method} ${c.req.path} not found`,
        defined: true,
    });
    return c.json(error.toJSON(), error.status as never);
};
