import { getConsoleSink } from '@logtape/logtape';
import {
    DEFAULT_REDACT_FIELDS,
    EMAIL_ADDRESS_PATTERN,
    JWT_PATTERN,
    redactByField,
    redactByPattern,
} from '@logtape/redaction';

import type { LoggerConfig, LogRecord, Sink } from '@logtape/logtape';

import { isProdEnv } from '../shared';

const RESET = '\x1b[0m';
const TIMESTAMP_COLOR = '\x1b[38;2;100;140;100m'; // muted green
const CATEGORY_COLOR = '\x1b[38;2;120;120;120m'; // gray

const LEVEL_STYLES: Record<string, { ansi: string; label: string }> = {
    debug: { ansi: '\x1b[48;2;80;80;80m\x1b[30m', label: ' DBG ' },
    info: { ansi: '\x1b[48;2;40;160;80m\x1b[30m', label: ' INF ' },
    warning: { ansi: '\x1b[48;2;200;170;30m\x1b[30m', label: ' WRN ' },
    error: { ansi: '\x1b[48;2;200;50;50m\x1b[30m', label: ' ERR ' },
    fatal: { ansi: '\x1b[48;2;160;40;160m\x1b[30m', label: ' FTL ' },
};

function formatAMPM(timestamp: number) {
    const date = new Date(timestamp);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours.toString().padStart(2, '0')}:${minutes}:${seconds}.${milliseconds} ${ampm}`;
}

function colorizeLevel(level: string): string {
    const style = LEVEL_STYLES[level];
    if (!style) return ` ${level.toUpperCase()} `;
    return `${style.ansi}${style.label}${RESET}`;
}

const isBrowser = typeof window !== 'undefined';

/**
 * A console formatter with ANSI-colored output for Node.js terminals.
 *
 * - Timestamp: dim green
 * - Level: boxed with colored background + black text
 * - Category: dimmed
 * - Error objects: appended via `%o` so the terminal prints the stack trace.
 */
function consoleFormatter(record: LogRecord): unknown[] {
    // Build message string from LogTape template parts
    let msg = '';
    const values: unknown[] = [];
    for (let i = 0; i < record.message.length; i++) {
        if (i % 2 === 0) {
            msg += String(record.message[i]);
        } else {
            msg += '%o';
            values.push(record.message[i]);
        }
    }

    if (isBrowser) {
        const level = record.level.toUpperCase().slice(0, 3);
        const category = record.category.join('·');
        const formatted = `${formatAMPM(record.timestamp)} [${level}] ${category} ${msg}`;
        const error = record.properties?.error ?? record.properties?.err;
        if (error instanceof Error && !values.includes(error)) {
            return [`${formatted} ${error.message}\n`, ...values, error];
        }
        return [formatted, ...values];
    }

    const timestamp = `${TIMESTAMP_COLOR}${formatAMPM(record.timestamp)}${RESET}`;
    const level = colorizeLevel(record.level);
    const category = `${CATEGORY_COLOR}${record.category.join('·')}${RESET}`;

    let formatted = `${timestamp} ${level} ${category} ${msg}`;

    // Append Error objects so the terminal always prints the stack trace
    const error = record.properties?.error ?? record.properties?.err;
    if (error instanceof Error && !values.includes(error)) {
        formatted += ` ${error.message}\n%o`;
        return [formatted, ...values, error];
    }

    return [formatted, ...values];
}

const PROD_MIN_LEVELS: ReadonlySet<string> = new Set([
    'warning',
    'error',
    'fatal',
]);

function gateSink(
    predicate: (record: LogRecord) => boolean,
    inner: Sink,
): Sink {
    return (record) => {
        if (!predicate(record)) return;
        inner(record);
    };
}

function redactDefaultFields(sink: Sink): Sink {
    return redactByField(sink, {
        fieldPatterns: DEFAULT_REDACT_FIELDS,
        action: () => '[REDACTED]',
    });
}

export function buildSinksAndLoggers(
    environment: string,
    otelSinkFactory?: () => Sink,
    consoleRef?: Console,
): { sinks: Record<string, Sink>; loggers: LoggerConfig<string, string>[] } {
    const isProd = isProdEnv(environment);

    const rawConsole = getConsoleSink({
        ...(consoleRef ? { console: consoleRef } : {}),
        formatter: redactByPattern(consoleFormatter, [
            EMAIL_ADDRESS_PATTERN,
            JWT_PATTERN,
        ]),
    });
    const consoleSink = redactDefaultFields(rawConsole);

    const sinks: Record<string, Sink> = {
        console: consoleSink,
        'console.gated': gateSink(() => !isProd, consoleSink),
    };

    const rootSinks = ['console.gated'];
    const opsSinks = ['console'];

    if (otelSinkFactory) {
        const otelSink = redactDefaultFields(otelSinkFactory());
        sinks.otel = otelSink;
        sinks['otel.gated'] = gateSink(
            (record) => !isProd || PROD_MIN_LEVELS.has(record.level),
            otelSink,
        );
        rootSinks.push('otel.gated');
        opsSinks.push('otel');
    }

    const loggers = buildLoggerCategories(rootSinks, opsSinks);

    return { sinks, loggers };
}

function buildLoggerCategories(
    rootSinks: string[],
    opsSinks: string[],
): LoggerConfig<string, string>[] {
    return [
        { category: [], sinks: rootSinks, lowestLevel: 'debug' },
        {
            category: ['local'],
            sinks: ['console'],
            lowestLevel: 'debug',
            parentSinks: 'override',
        },
        {
            category: ['ops'],
            sinks: opsSinks,
            lowestLevel: 'debug',
            parentSinks: 'override',
        },
        {
            category: ['logtape', 'meta'],
            sinks: ['console.gated'],
            lowestLevel: 'warning',
        },
    ];
}
