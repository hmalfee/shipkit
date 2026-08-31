import { configure, getLogger } from '@logtape/logtape';

import type { Logger } from '@logtape/logtape';
import type { LoggerProvider } from '@opentelemetry/sdk-logs';
import type { OtelLoggerConfig, OtelLogSinkResult } from './otel-sink';

import { buildOtelLogSink } from './otel-sink';
import { buildSinksAndLoggers } from './sinks';

export interface AppLogger extends Logger {
    local: Logger;
    ops: Logger;
}

export type { Logger };

/**
 * Production logging behavior:
 *
 * | Logger        | Env  | Console | OTEL | Levels |
 * |---------------|------|---------|------|--------|
 * | logger        | dev  | yes     | yes  | all    |
 * | logger        | prod | no      | warn+| —      |
 * | logger.local  | any  | yes     | no   | all    |
 * | logger.ops    | any  | yes     | yes  | all    |
 *
 * Dev: all levels go to both sinks unconditionally for the root logger.
 */

export interface InitLoggerOptions extends OtelLoggerConfig {
    otelSinkResult?: OtelLogSinkResult | null;
}

const isBrowser = typeof window !== 'undefined';
let logProvider: LoggerProvider | undefined;
let initPromise: Promise<void> | undefined;

export const logger: AppLogger = Object.assign(getLogger(), {
    local: getLogger(['local']),
    ops: getLogger(['ops']),
});

/**
 * Configures LogTape sinks for the current environment (browser or Node.js).
 * Idempotent — concurrent calls share the same in-flight promise.
 */
export function initLogger(options: InitLoggerOptions): Promise<void> {
    return (initPromise ??= initLoggerOnce(options));
}

async function initLoggerOnce(options: InitLoggerOptions): Promise<void> {
    if (isBrowser) {
        const { sinks, loggers } = buildSinksAndLoggers(
            options.environment,
            options.otelSinkResult
                ? () => options.otelSinkResult!.sink
                : undefined,
            console,
        );
        await configure({ sinks, loggers });
        logProvider = options.otelSinkResult?.loggerProvider;
        return;
    }

    const { AsyncLocalStorage } = await import('node:async_hooks');

    const otel = buildOtelLogSink(options);
    const { sinks, loggers } = buildSinksAndLoggers(
        options.environment,
        otel ? () => otel.sink : undefined,
    );

    await configure({
        contextLocalStorage: new AsyncLocalStorage(),
        sinks,
        loggers,
    });

    logProvider = otel?.loggerProvider;
}

export async function shutdownLogger(): Promise<void> {
    await logProvider?.shutdown();
    logProvider = undefined;
    initPromise = undefined;
}
