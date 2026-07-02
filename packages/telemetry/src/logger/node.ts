import { AsyncLocalStorage } from 'node:async_hooks';

import { configure, getConsoleSink } from '@logtape/logtape';
import {
    DEFAULT_REDACT_FIELDS,
    EMAIL_ADDRESS_PATTERN,
    JWT_PATTERN,
    redactByField,
    redactByPattern,
} from '@logtape/redaction';

import type { Sink } from '@logtape/logtape';
import type { LoggerConfig } from './config';

import { buildOtelLogSink } from './config';
import { consoleFormatter } from './formatter';

export async function initNodeLogger(config: LoggerConfig) {
    const isProd = config.environment === 'production';

    const otel = buildOtelLogSink({
        ...config,
    });

    const rawConsoleSink = redactByField(
        getConsoleSink({
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

    const consoleSink: Sink = (record) => {
        if (!isProd || record.properties?.forceConsole) {
            rawConsoleSink(record);
        }
    };

    await configure({
        contextLocalStorage: new AsyncLocalStorage(),
        sinks: {
            console: consoleSink,
            ...(otel ? { otel: otel.sink } : {}),
        },
        loggers: [
            {
                category: [],
                sinks: ['console', ...(otel ? ['otel'] : [])],
                lowestLevel: isProd ? 'info' : 'debug',
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

    return otel?.loggerProvider;
}
