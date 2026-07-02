import { configure, getConsoleSink } from '@logtape/logtape';
import {
    DEFAULT_REDACT_FIELDS,
    EMAIL_ADDRESS_PATTERN,
    JWT_PATTERN,
    redactByField,
    redactByPattern,
} from '@logtape/redaction';

import type { Sink } from '@logtape/logtape';

import { consoleFormatter } from './formatter';

export interface BrowserLoggerConfig {
    otelSink?: Sink;
    environment: string;
}

export async function initBrowserLogger(config: BrowserLoggerConfig) {
    const rawConsoleSink = redactByField(
        getConsoleSink({
            console,
            formatter: redactByPattern(consoleFormatter, [
                EMAIL_ADDRESS_PATTERN,
                JWT_PATTERN,
            ]),
        }),
        {
            fieldPatterns: DEFAULT_REDACT_FIELDS,
            action: () => '[REDACTED]',
        },
    );

    const isProd = config.environment === 'production';

    const consoleSink: Sink = (record) => {
        if (!isProd || record.properties?.forceConsole) {
            rawConsoleSink(record);
        }
    };

    await configure({
        sinks: {
            console: consoleSink,
            ...(config.otelSink ? { otel: config.otelSink } : {}),
        },
        loggers: [
            {
                category: [],
                sinks: ['console', ...(config.otelSink ? ['otel'] : [])],
                lowestLevel: 'debug',
            },
            {
                category: ['local'],
                sinks: ['console'],
                lowestLevel: 'debug',
            },
            {
                category: ['logtape', 'meta'],
                sinks: ['console'],
                lowestLevel: 'warning',
            },
        ],
    });
}
