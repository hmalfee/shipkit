import type { Context } from '@opentelemetry/api';
import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import type {
    ReadableSpan,
    Span,
    SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

export abstract class NoopLifecycleSpanProcessor implements SpanProcessor {
    onStart(_span: Span, _context: Context): void {
        /* empty */
    }
    abstract onEnd(span: ReadableSpan): void;
    forceFlush(): Promise<void> {
        return Promise.resolve();
    }
    shutdown(): Promise<void> {
        return Promise.resolve();
    }
}

export abstract class NoopLifecycleLogRecordProcessor implements LogRecordProcessor {
    abstract onEmit(logRecord: SdkLogRecord, context?: Context): void;
    forceFlush(): Promise<void> {
        return Promise.resolve();
    }
    shutdown(): Promise<void> {
        return Promise.resolve();
    }
}

export abstract class DelegatingSpanProcessor implements SpanProcessor {
    constructor(protected readonly _delegate: SpanProcessor) {}
    onStart(span: Span, context: Context): void {
        this._delegate.onStart(span, context);
    }
    abstract onEnd(span: ReadableSpan): void;
    forceFlush(): Promise<void> {
        return this._delegate.forceFlush();
    }
    shutdown(): Promise<void> {
        return this._delegate.shutdown();
    }
}
