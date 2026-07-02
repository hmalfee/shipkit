import { parse as parseStackTrace } from 'stacktrace-parser';

import type { AnyValue } from '@opentelemetry/api-logs';
import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import type {
    ReadableSpan,
    SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

type DebugIdsByUrl = Map<string, string>;

function getDebugIdsByUrl(): DebugIdsByUrl {
    const { _debugIds } = globalThis as unknown as {
        _debugIds?: Record<string, string>;
    };
    if (!_debugIds) return new Map();

    const result: DebugIdsByUrl = new Map();
    for (const [stackKey, debugId] of Object.entries(_debugIds)) {
        if (!stackKey || !debugId) continue;
        const frames = parseStackTrace(stackKey + '\n');
        for (const frame of frames) {
            if (frame.file) result.set(frame.file, debugId);
        }
    }
    return result;
}

function stripQuery(url: string): string {
    return url.split('?')[0]!;
}

function toPathname(url: string): string {
    try {
        return new URL(url).pathname;
    } catch {
        return url;
    }
}

export function extractDebugIds(stackTrace: string): string[] {
    const byUrl = getDebugIdsByUrl();
    if (!byUrl.size) return [];
    const mappings = new Set<string>();
    for (const frame of parseStackTrace(stackTrace)) {
        if (!frame.file) continue;
        const framePath = stripQuery(frame.file);
        for (const [pattern, id] of byUrl) {
            const patternPath = stripQuery(pattern);
            if (
                framePath === patternPath ||
                toPathname(framePath) === toPathname(patternPath)
            ) {
                mappings.add(`${framePath}=${id}`);
            }
        }
    }
    return [...mappings];
}

/**
 * A client-side OpenTelemetry span processor that intercepts exception events
 * and attaches `debug_id`s from `globalThis._debugIds` into `exception.stacktrace.debug_id_maps`.
 *
 * This is meant to run in the browser where the source maps database is inaccessible.
 * The attached IDs allow the createOtelIngestHandler to resolve the stack trace later.
 */
export class DebugIdEnrichingSpanProcessor implements SpanProcessor {
    onStart(): void {
        // no-op
    }
    onEnd(span: ReadableSpan): void {
        for (const event of span.events) {
            if (event.name !== 'exception') continue;
            const st = event.attributes?.['exception.stacktrace'] as
                | string
                | undefined;
            if (!st) continue;
            const ids = extractDebugIds(st);
            if (ids.length) {
                (event.attributes as Record<string, unknown>)[
                    'exception.stacktrace.debug_id_maps'
                ] = ids;
            }
        }
    }
    async forceFlush(): Promise<void> {
        // no-op
    }
    async shutdown(): Promise<void> {
        // no-op
    }
}

/**
 * A client-side OpenTelemetry log record processor that intercepts exceptions
 * and attaches `debug_id`s from `globalThis._debugIds` into `exception.stacktrace.debug_id_maps`.
 *
 * This is meant to run in the browser where the source maps database is inaccessible.
 * The attached IDs allow the createOtelIngestHandler to resolve the stack trace later.
 */
export class DebugIdEnrichingLogProcessor implements LogRecordProcessor {
    onEmit(logRecord: SdkLogRecord): void {
        const st = logRecord.attributes['exception.stacktrace'] as
            | string
            | undefined;
        if (!st) return;
        const ids = extractDebugIds(st);
        if (ids.length) {
            logRecord.setAttribute(
                'exception.stacktrace.debug_id_maps' as string,
                ids as AnyValue,
            );
        }
    }
    async forceFlush(): Promise<void> {
        // no-op
    }
    async shutdown(): Promise<void> {
        // no-op
    }
}
