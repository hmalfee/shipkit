import type { SourceMapResolver } from './resolver';

import { resolveStacktraceAttr } from './resolver';

interface SpanEvent {
    name: string;
    attributes: KeyValue[];
}

interface LogRecord {
    attributes: KeyValue[];
    body?: { stringValue?: string | null };
}

export interface OtlpTraceRequest {
    resourceSpans?: {
        scopeSpans?: {
            spans?: {
                events?: SpanEvent[];
            }[];
        }[];
    }[];
}

export interface OtlpLogsRequest {
    resourceLogs?: {
        scopeLogs?: {
            logRecords?: LogRecord[];
        }[];
    }[];
}

interface KeyValue {
    key: string;
    value: {
        stringValue?: string | null;
        arrayValue?: {
            values: { stringValue?: string | null }[];
        };
    };
}

function getStringAttr(attrs: KeyValue[], key: string): string | null {
    return attrs.find((a) => a.key === key)?.value?.stringValue ?? null;
}

function getArrayAttr(attrs: KeyValue[], key: string): string[] {
    const val = attrs.find((a) => a.key === key)?.value?.arrayValue;
    return (
        val?.values
            ?.map((v) => v.stringValue)
            .filter((s): s is string => !!s) ?? []
    );
}

function setStringAttr(attrs: KeyValue[], key: string, value: string) {
    const existing = attrs.find((a) => a.key === key);
    if (existing) {
        existing.value = { stringValue: value };
    } else {
        attrs.push({ key, value: { stringValue: value } });
    }
}

interface HasAttributes {
    attributes: KeyValue[];
    body?: { stringValue?: string | null };
}

function resolveItems(items: HasAttributes[], resolver: SourceMapResolver) {
    for (const item of items) {
        resolveStacktraceAttr(
            {
                getStacktrace: () =>
                    getStringAttr(item.attributes, 'exception.stacktrace') ??
                    item.body?.stringValue ??
                    null,
                getDebugIds: () =>
                    getArrayAttr(
                        item.attributes,
                        'exception.stacktrace.debug_id_maps',
                    ),
                setResolved: (resolved, original) => {
                    setStringAttr(
                        item.attributes,
                        'exception.stacktrace',
                        resolved,
                    );
                    setStringAttr(
                        item.attributes,
                        'exception.stacktrace.original',
                        original,
                    );
                },
            },
            resolver,
            // No deriveIds — the proxy path only ever sees already-enriched payloads.
        );
    }
}

export function resolveExceptionStackTraces(
    request: OtlpTraceRequest,
    resolver: SourceMapResolver,
): void {
    const events: SpanEvent[] = (request.resourceSpans ?? [])
        .flatMap((rs) => rs.scopeSpans ?? [])
        .flatMap((ss) => ss.spans ?? [])
        .flatMap((s) => s.events ?? [])
        .filter((e) => e.name === 'exception');
    resolveItems(events, resolver);
}

export function resolveExceptionLogs(
    request: OtlpLogsRequest,
    resolver: SourceMapResolver,
): void {
    const records: LogRecord[] = (request.resourceLogs ?? [])
        .flatMap((rl) => rl.scopeLogs ?? [])
        .flatMap((sl) => sl.logRecords ?? []);
    resolveItems(records, resolver);
}
