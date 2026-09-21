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

export interface SpanPipelineStage {
    readonly name: string;
    onStart?(span: Span, ctx: Context): void;
    /** 'drop' short-circuits the rest of the pipeline — the span never reaches the delegate. */
    onEnd(span: ReadableSpan): 'keep' | 'drop';
}

/**
 * Runs an ordered list of stages against every span. This class is the
 * single place "what order do filtering/enrichment/redaction happen in"
 * lives — read the array passed at the call site, not this file.
 */
export class PipelineSpanProcessor extends DelegatingSpanProcessor {
    constructor(
        delegate: SpanProcessor,
        private readonly stages: SpanPipelineStage[],
    ) {
        super(delegate);
    }

    override onStart(span: Span, ctx: Context): void {
        for (const stage of this.stages) stage.onStart?.(span, ctx);
        super.onStart(span, ctx);
    }

    override onEnd(span: ReadableSpan): void {
        for (const stage of this.stages) {
            if (stage.onEnd(span) === 'drop') return;
        }
        this._delegate.onEnd(span);
    }
}
