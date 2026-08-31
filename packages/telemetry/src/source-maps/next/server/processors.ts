import type { AnyValue } from '@opentelemetry/api-logs';
import type { SdkLogRecord } from '@opentelemetry/sdk-logs';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { SourceMapResolver } from './resolver';

import {
    NoopLifecycleLogRecordProcessor,
    NoopLifecycleSpanProcessor,
} from '../../../processor-base';
import { extractDebugIds } from '../client';
import { resolveStacktraceAttr } from './resolver';
import { defaultSourceMapDbPath, getSharedSourceMapResolver } from './store';

/**
 * A server-side OpenTelemetry span processor that intercepts exception events and resolves
 * their stack traces synchronously.
 *
 * It extracts `debug_id`s dynamically and queries a local SQLite database
 * to resolve the stack trace before exporting the telemetry payload.
 */
export class SourceMapResolvingSpanProcessor extends NoopLifecycleSpanProcessor {
    private readonly resolver: SourceMapResolver | null;

    constructor() {
        super();
        this.resolver = getSharedSourceMapResolver(defaultSourceMapDbPath());
    }

    onEnd(span: ReadableSpan): void {
        if (!this.resolver) return;
        for (const event of span.events) {
            if (event.name !== 'exception') continue;
            const attrs = event.attributes as Record<string, unknown>;
            resolveStacktraceAttr(
                {
                    getStacktrace: () =>
                        typeof attrs['exception.stacktrace'] === 'string'
                            ? attrs['exception.stacktrace']
                            : null,
                    getDebugIds: () =>
                        (attrs['exception.stacktrace.debug_id_maps'] as
                            string[] | undefined) ?? [],
                    setResolved: (resolved, original) => {
                        attrs['exception.stacktrace'] = resolved;
                        attrs['exception.stacktrace.original'] = original;
                    },
                },
                this.resolver,
                extractDebugIds,
            );
        }
    }
}

/**
 * A server-side OpenTelemetry log record processor that intercepts exceptions and resolves
 * their stack traces synchronously.
 *
 * It extracts `debug_id`s dynamically and queries a local SQLite database
 * to resolve the stack trace before exporting the telemetry payload.
 */
export class SourceMapResolvingLogProcessor extends NoopLifecycleLogRecordProcessor {
    private readonly resolver: SourceMapResolver | null;

    constructor() {
        super();
        this.resolver = getSharedSourceMapResolver(defaultSourceMapDbPath());
    }

    onEmit(logRecord: SdkLogRecord): void {
        if (!this.resolver) return;
        resolveStacktraceAttr(
            {
                getStacktrace: () => {
                    const st = logRecord.attributes['exception.stacktrace'];
                    return typeof st === 'string' ? st : null;
                },
                getDebugIds: () =>
                    (logRecord.attributes[
                        'exception.stacktrace.debug_id_maps'
                    ] as string[] | undefined) ?? [],
                setResolved: (resolved, original) => {
                    logRecord.setAttribute(
                        'exception.stacktrace' as string,
                        resolved as AnyValue,
                    );
                    logRecord.setAttribute(
                        'exception.stacktrace.original' as string,
                        original as AnyValue,
                    );
                },
            },
            this.resolver,
            extractDebugIds,
        );
    }
}
