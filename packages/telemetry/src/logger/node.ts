import { AsyncLocalStorage } from 'node:async_hooks';

import { configure } from '@logtape/logtape';

import type { Sink } from '@logtape/logtape';
import type { LoggerConfig } from './config';

import { buildOtelLogSink } from './config';
import {
    buildLoggerCategories,
    buildRedactedConsoleSink,
    withProdConsoleGate,
    withProdOtelGate,
} from './internals';

export async function initNodeLogger(config: LoggerConfig) {
    const isProd = config.environment === 'production';

    const otel = buildOtelLogSink({
        ...config,
    });

    const consoleSink = withProdConsoleGate(isProd, buildRedactedConsoleSink());
    const otelSink = otel ? withProdOtelGate(isProd, otel.sink) : undefined;

    const sinks: Record<string, Sink> = {
        console: consoleSink,
    };
    if (otelSink) {
        sinks.otel = otelSink;
    }

    await configure({
        contextLocalStorage: new AsyncLocalStorage(),
        sinks,
        loggers: buildLoggerCategories([
            'console',
            ...(otelSink ? ['otel'] : []),
        ]),
    });

    return otel?.loggerProvider;
}
