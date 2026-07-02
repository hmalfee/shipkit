export interface OtlpTraceRequest {
    resourceSpans?: {
        scopeSpans?: {
            spans?: {
                events?: {
                    name: string;
                    attributes: KeyValue[];
                }[];
            }[];
        }[];
    }[];
}

export interface OtlpLogsRequest {
    resourceLogs?: {
        scopeLogs?: {
            logRecords?: {
                attributes: KeyValue[];
                body?: { stringValue?: string | null };
            }[];
        }[];
    }[];
}

export interface KeyValue {
    key: string;
    value: {
        stringValue?: string | null;
        arrayValue?: {
            values: { stringValue?: string | null }[];
        };
    };
}

export function getStringAttr(attrs: KeyValue[], key: string): string | null {
    return attrs.find((a) => a.key === key)?.value?.stringValue ?? null;
}

export function getArrayAttr(attrs: KeyValue[], key: string): string[] {
    const val = attrs.find((a) => a.key === key)?.value?.arrayValue;
    return (
        val?.values
            ?.map((v) => v.stringValue)
            .filter((s): s is string => !!s) ?? []
    );
}

export function setStringAttr(attrs: KeyValue[], key: string, value: string) {
    const existing = attrs.find((a) => a.key === key);
    if (existing) {
        existing.value = { stringValue: value };
    } else {
        attrs.push({ key, value: { stringValue: value } });
    }
}
