import { SmartCoercionPlugin } from '@orpc/json-schema';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { onError, ORPCError, ValidationError } from '@orpc/server';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import z from 'zod';

import type { AnyContractRouter } from '@orpc/contract';
import type { Context, Router } from '@orpc/server';
import type { StandardHandlerPlugin } from '@orpc/server/standard';
import type { Logger } from '@shipkit/telemetry/logger';

export type FetchHandlerOptions = {
    logger: Logger;
    /** Mounts the OpenAPI reference UI. Omit in production. */
    docs?: { title: string; version?: string };
};

export async function createFetchHandler<TContext extends Context>(
    router: Router<AnyContractRouter, TContext>,
    { logger, docs }: FetchHandlerOptions,
) {
    const schemaConverters = [new ZodToJsonSchemaConverter()];

    const plugins: StandardHandlerPlugin<TContext>[] = [
        new SmartCoercionPlugin<TContext>({ schemaConverters }),
    ];

    if (docs) {
        const { OpenAPIReferencePlugin } =
            await import('@orpc/openapi/plugins');
        plugins.push(
            new OpenAPIReferencePlugin<TContext>({
                schemaConverters,
                specGenerateOptions: {
                    info: {
                        title: docs.title,
                        version: docs.version ?? '1.0.0',
                    },
                },
            }),
        );
    }

    const handler = new OpenAPIHandler<TContext>(router, {
        plugins,
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

    return {
        /** Always resolves to a Response. Unmatched routes get a JSON 404. */
        async handle(request: Request, context: TContext): Promise<Response> {
            const { matched, response } = await handler.handle(request, {
                context,
            });
            if (matched) return response;

            const error = new ORPCError('NOT_FOUND', {
                message: `Route ${request.method} ${new URL(request.url).pathname} not found`,
                defined: true,
            });
            return Response.json(error.toJSON(), { status: error.status });
        },
    };
}
