import type { KeyValue, OtlpLogsRequest, OtlpTraceRequest } from './attr-utils';
import type { SourceMapResolver } from './resolver';

import { getArrayAttr, getStringAttr, setStringAttr } from './attr-utils';

interface HasAttributes {
    attributes: KeyValue[];
    body?: { stringValue?: string | null };
}

function resolveItems(items: HasAttributes[], resolver: SourceMapResolver) {
    for (const item of items) {
        const debugIdMaps = getArrayAttr(
            item.attributes,
            'exception.stacktrace.debug_id_maps',
        );
        if (!debugIdMaps.length) continue;

        const stacktrace =
            getStringAttr(item.attributes, 'exception.stacktrace') ??
            item.body?.stringValue ??
            null;
        if (!stacktrace) continue;

        const resolved = resolver.resolveStackTrace(stacktrace, debugIdMaps);
        setStringAttr(item.attributes, 'exception.stacktrace', resolved);
        setStringAttr(
            item.attributes,
            'exception.stacktrace.original',
            stacktrace,
        );
    }
}

export function resolveExceptionStackTraces(
    request: OtlpTraceRequest,
    resolver: SourceMapResolver,
): void {
    const events = (request.resourceSpans ?? [])
        .flatMap((rs) => rs.scopeSpans ?? [])
        .flatMap((ss) => ss.spans ?? [])
        .flatMap((s) => s.events ?? [])
        .filter((e) => e.name === 'exception');
    resolveItems(events as unknown as HasAttributes[], resolver);
}

export function resolveExceptionLogs(
    request: OtlpLogsRequest,
    resolver: SourceMapResolver,
): void {
    const records = (request.resourceLogs ?? [])
        .flatMap((rl) => rl.scopeLogs ?? [])
        .flatMap((sl) => sl.logRecords ?? []);
    resolveItems(records as unknown as HasAttributes[], resolver);
}
