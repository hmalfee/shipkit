import { configure } from '@logtape/logtape';

import type { Sink } from '@logtape/logtape';

import {
    buildLoggerCategories,
    buildRedactedConsoleSink,
    withProdConsoleGate,
    withProdOtelGate,
} from './internals';

export interface BrowserLoggerConfig {
    otelSink?: Sink;
    environment: string;
}

export async function initBrowserLogger(config: BrowserLoggerConfig) {
    const isProd = config.environment === 'production';

    const consoleSink = withProdConsoleGate(
        isProd,
        buildRedactedConsoleSink(console),
    );
    const otelSink = config.otelSink
        ? withProdOtelGate(isProd, config.otelSink)
        : undefined;

    const sinks: Record<string, Sink> = {
        console: consoleSink,
    };
    if (otelSink) {
        sinks.otel = otelSink;
    }

    await configure({
        sinks,
        loggers: buildLoggerCategories([
            'console',
            ...(otelSink ? ['otel'] : []),
        ]),
    });
}
