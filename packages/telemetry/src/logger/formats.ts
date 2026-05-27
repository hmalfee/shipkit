import { inspect } from 'node:util';

import winston from 'winston';

import { getActiveSpan } from '../tracing/spans';

const injectTraceContext = winston.format((info) => {
    const span = getActiveSpan();
    if (span) {
        const { traceId, spanId, traceFlags } = span.spanContext();
        // OTel spec: JSON log correlation expects snake_case
        info.trace_id = traceId;
        info.span_id = spanId;
        info.trace_flags = traceFlags.toString(16).padStart(2, '0');
    }
    return info;
});

export const otelFormat = winston.format.combine(
    injectTraceContext(),
    winston.format.timestamp(),
    winston.format.json(),
);

// ANSI helpers
const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[39m`;
const red = (s: string) => `\x1b[31m${s}\x1b[39m`;
const green = (s: string) => `\x1b[32m${s}\x1b[39m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[39m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[39m`;
const blue = (s: string) => `\x1b[34m${s}\x1b[39m`;
const white = (s: string) => `\x1b[97m${s}\x1b[39m`;

const METHOD_COLORS: Record<string, (s: string) => string> = {
    GET: green,
    POST: cyan,
    PUT: yellow,
    PATCH: magenta,
    DELETE: red,
    HEAD: blue,
    OPTIONS: dim,
};

/** Colorizes the first HTTP method word found in a string, if any. */
function colorizeMethod(message: string): string {
    return message.replace(
        /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/,
        (method) => bold((METHOD_COLORS[method] ?? white)(method)),
    );
}

const LEVEL_LABELS: Record<string, string> = {
    error: red(bold('ERR ')),
    warn: `\x1b[33m${bold('WARN')}\x1b[39m`,
    info: cyan('INFO'),
    http: `\x1b[35mHTTP\x1b[39m`,
    verbose: `\x1b[34mVRBS\x1b[39m`,
    debug: `\x1b[90mDBUG\x1b[39m`,
    silly: `\x1b[90mSLLY\x1b[39m`,
};

export const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'hh:mm:ss.SSS A' }),
    winston.format.printf((info) => {
        const {
            level,
            message,
            timestamp,
            trace_id,
            span_id,
            trace_flags: _trace_flags,
            service,
            stack,
            ...meta
        } = info;

        const time = dim(timestamp as string);
        const lvl = LEVEL_LABELS[level] ?? level.toUpperCase().padEnd(4);
        const svc = service ? dim(`[${service as string}]`) : '';

        // Trace context — shortened IDs, dimmed
        const trace =
            trace_id && span_id
                ? dim(
                      ` ${(trace_id as string).slice(0, 8)}:${(span_id as string).slice(0, 8)}`,
                  )
                : '';

        // Build the main line — colorize HTTP method words in the message
        let output = `${time} ${lvl} ${svc} ${colorizeMethod(message as string)}${trace}`;

        // Error stack — indented, dimmed
        if (stack) {
            const stackLines = (stack as string).split('\n').slice(1);
            if (stackLines.length > 0) {
                output +=
                    '\n' +
                    stackLines
                        .map((line) => dim(`  ${line.trim()}`))
                        .join('\n');
            }
        }

        // Metadata — pretty-printed, indented
        // Filter out Winston internal symbols
        const cleanMeta: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(meta)) {
            if (typeof key !== 'symbol') {
                cleanMeta[key] = value;
            }
        }

        if (Object.keys(cleanMeta).length > 0) {
            const formatted = inspect(cleanMeta, {
                colors: true,
                depth: 4,
                compact: false,
                breakLength: 80,
            });
            // Indent each line and dim the braces
            const lines = formatted.split('\n');
            if (lines.length === 1) {
                // Single-line metadata — inline
                output += ` ${dim(formatted)}`;
            } else {
                // Multi-line — indented below
                output +=
                    '\n' + lines.map((line) => `  ${dim(line)}`).join('\n');
            }
        }

        return output;
    }),
);
