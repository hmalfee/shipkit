import { getLogger } from '@logtape/logtape';

import type { Logger } from '@logtape/logtape';
import type { LoggerProvider } from '@opentelemetry/sdk-logs';
import type { LoggerConfig, OtelLogSinkResult } from './config';

import { initBrowserLogger } from './browser';

export type { Logger };

/**
 * Production logging behavior:
 *
 * | Level   | alwaysLog | Console | OTEL |
 * |---------|-----------|---------|------|
 * | debug   | false     | -       | -    |
 * | info    | false     | -       | -    |
 * | warn+   | false     | -       | yes  |
 * | any     | true      | yes     | yes  |
 *
 * Dev: all levels go to both sinks unconditionally.
 */

export interface InitLoggerOptions extends LoggerConfig {
    otelSinkResult?: OtelLogSinkResult | null;
}

const isBrowser = typeof window !== 'undefined';
let logProvider: LoggerProvider | undefined;
let initialized = false;

export const logger: Logger = getLogger();

export async function initLogger(options: InitLoggerOptions): Promise<void> {
    if (initialized) return;
    initialized = true;

    if (isBrowser) {
        await initBrowserLogger({
            otelSink: options.otelSinkResult?.sink,
            environment: options.environment,
        });
        logProvider = options.otelSinkResult?.loggerProvider;
        return;
    }

    const { initNodeLogger } = await import('./node');
    logProvider = await initNodeLogger(options);
}

export async function shutdownLogger(): Promise<void> {
    await logProvider?.shutdown();
    logProvider = undefined;
    initialized = false;
}

export { withContext } from '@logtape/logtape';
