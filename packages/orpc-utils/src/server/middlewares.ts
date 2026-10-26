import { ORPCError, os } from '@orpc/server';

import type { Context } from '@orpc/server';
import type { Logger } from '@shipkit/telemetry/logger';

/** Timing for every route; failures are logged only when unexpected (non-4xx). */
export function routeLogging<TContext extends Context = Context>({
    logSuccess,
    logger: loggerOption,
}: {
    logSuccess: boolean;
    /** A logger instance, or a function that resolves one from the context. */
    logger: Logger | ((context: TContext) => Logger);
}) {
    return os
        .$context<TContext>()
        .middleware(async ({ context, next, path }) => {
            const logger =
                typeof loggerOption === 'function'
                    ? loggerOption(context)
                    : loggerOption;
            const start = Date.now();
            const orpcPath = path.join('.');
            try {
                const result = await next();
                if (logSuccess) {
                    logger.info(
                        `[oRPC] {orpcPath} executed in {durationMs}ms`,
                        { orpcPath, durationMs: Date.now() - start },
                    );
                }
                return result;
            } catch (error) {
                const expected =
                    error instanceof ORPCError && error.status < 500;
                if (!expected) {
                    logger.error(`[oRPC] {orpcPath} failed in {durationMs}ms`, {
                        orpcPath,
                        durationMs: Date.now() - start,
                    });
                }
                // rethrow to be handled by the global error handler
                throw error;
            }
        });
}

/** Simulates network delay to surface loading-state bugs. */
export function simulateLatency({
    enabled,
    minMs = 300,
    maxMs = 1200,
}: {
    enabled: boolean;
    minMs?: number;
    maxMs?: number;
}) {
    return os.middleware(async ({ next }) => {
        if (enabled) {
            const delay =
                Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        return next();
    });
}
