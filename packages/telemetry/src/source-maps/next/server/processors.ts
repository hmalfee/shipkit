import { existsSync } from 'node:fs';

import { getLogger } from '@logtape/logtape';

import type { AnyValue } from '@opentelemetry/api-logs';
import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import type {
    ReadableSpan,
    SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type { SourceMapResolver } from './resolver';

import { extractDebugIds } from '../client/debug-id';
import { createSourceMapResolver } from './resolver';
import { createSqliteStore, DEFAULT_DB_PATH } from './store';

const logger = getLogger(['telemetry', 'sourcemaps']);
// oxlint-disable-next-line eslint-js/no-restricted-syntax
const isProd = process.env.NODE_ENV === 'production';

/**
 * A server-side OpenTelemetry span processor that intercepts exception events and resolves
 * their stack traces synchronously.
 *
 * It extracts `debug_id`s dynamically and queries a local SQLite database (`.next/sourcemaps.db`)
 * to resolve the stack trace before exporting the telemetry payload.
 */
export class SourceMapResolvingSpanProcessor implements SpanProcessor {
    private resolver: SourceMapResolver | null = null;

    constructor() {
        if (!existsSync(DEFAULT_DB_PATH)) {
            const msg = `Telemetry SourceMaps Database not found at ${DEFAULT_DB_PATH}. Exception stacktraces will not be resolved.`;
            if (isProd) {
                logger.error(msg);
            } else {
                logger.warn(msg);
            }
            return;
        }
        try {
            const store = createSqliteStore(DEFAULT_DB_PATH);
            this.resolver = createSourceMapResolver((id) => store.get(id));
        } catch (error) {
            logger.error(
                `Failed to initialize SourceMaps database: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    onStart(): void {
        // no-op
    }

    onEnd(span: ReadableSpan): void {
        if (!this.resolver) return;
        for (const event of span.events) {
            if (event.name !== 'exception') continue;
            const st = event.attributes?.['exception.stacktrace'];
            if (typeof st !== 'string') continue;

            const clientIds = event.attributes?.[
                'exception.stacktrace.debug_id_maps'
            ] as string[] | undefined;
            const ids = clientIds?.length ? clientIds : extractDebugIds(st);

            if (ids.length) {
                const resolved = this.resolver.resolveStackTrace(st, ids);
                if (resolved !== st) {
                    (event.attributes as Record<string, unknown>)[
                        'exception.stacktrace'
                    ] = resolved;
                    (event.attributes as Record<string, unknown>)[
                        'exception.stacktrace.original'
                    ] = st;
                }
            }
        }
    }

    async forceFlush(): Promise<void> {
        // no-op
    }

    async shutdown(): Promise<void> {
        this.resolver?.close();
    }
}

/**
 * A server-side OpenTelemetry log record processor that intercepts exceptions and resolves
 * their stack traces synchronously.
 *
 * It extracts `debug_id`s dynamically and queries a local SQLite database (`.next/sourcemaps.db`)
 * to resolve the stack trace before exporting the telemetry payload.
 */
export class SourceMapResolvingLogProcessor implements LogRecordProcessor {
    private resolver: SourceMapResolver | null = null;

    constructor() {
        if (!existsSync(DEFAULT_DB_PATH)) {
            const msg = `Telemetry SourceMaps Database not found at ${DEFAULT_DB_PATH}. Exception stacktraces will not be resolved.`;
            if (isProd) {
                logger.error(msg);
            } else {
                logger.warn(msg);
            }
            return;
        }
        try {
            const store = createSqliteStore(DEFAULT_DB_PATH);
            this.resolver = createSourceMapResolver((id) => store.get(id));
        } catch (error) {
            logger.error(
                `Failed to initialize SourceMaps database: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    onEmit(logRecord: SdkLogRecord): void {
        if (!this.resolver) return;
        const st = logRecord.attributes['exception.stacktrace'];
        if (typeof st !== 'string') return;

        const clientIds = logRecord.attributes[
            'exception.stacktrace.debug_id_maps'
        ] as string[] | undefined;
        const ids = clientIds?.length ? clientIds : extractDebugIds(st);

        if (ids.length) {
            const resolved = this.resolver.resolveStackTrace(st, ids);
            if (resolved !== st) {
                logRecord.setAttribute(
                    'exception.stacktrace' as string,
                    resolved as AnyValue,
                );
                logRecord.setAttribute(
                    'exception.stacktrace.original' as string,
                    st as AnyValue,
                );
            }
        }
    }

    async forceFlush(): Promise<void> {
        // no-op
    }

    async shutdown(): Promise<void> {
        this.resolver?.close();
    }
}
