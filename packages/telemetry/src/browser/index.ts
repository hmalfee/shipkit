import {
    CompositePropagator,
    W3CBaggagePropagator,
    W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import {
    BatchSpanProcessor,
    ParentBasedSampler,
    TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';

import type { Context } from '@opentelemetry/api';
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import type {
    ReadableSpan,
    Span,
    SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

import { initLogger, shutdownLogger } from '../logger';
import { buildOtelLogSink } from '../logger/config';
import { buildResource } from '../shared';

class BrowserFilteringSpanProcessor implements SpanProcessor {
    constructor(private readonly _delegate: SpanProcessor) {}

    onStart(span: Span, context: Context): void {
        this._delegate.onStart(span, context);
    }

    onEnd(span: ReadableSpan): void {
        // Drop aborted/cancelled fetches (status 0 = request never completed).
        // Framework-agnostic — happens with React navigation, StrictMode, any SPA.
        if (span.attributes['http.status_code'] === 0) {
            return; // drop the span
        }

        this._delegate.onEnd(span);
    }

    shutdown(): Promise<void> {
        return this._delegate.shutdown();
    }

    forceFlush(): Promise<void> {
        return this._delegate.forceFlush();
    }
}

export interface BrowserTelemetryConfig {
    serviceName: string;
    serviceVersion?: string;
    otelEndpoint?: string;
    propagateToUrls?: RegExp[];
    environment?: string;
    captureConsole?: boolean;
    resourceAttributes?: Record<string, string>;
    extraSpanProcessors?: SpanProcessor[];
    extraLogProcessors?: LogRecordProcessor[];
    ignoredUrls?: (string | RegExp)[];
    /** Enable Next.js specific telemetry filtering. */
    nextjs?: boolean;
}

const NEXTJS_IGNORED_URLS: (string | RegExp)[] = [
    /__nextjs_/, // internal Next.js requests (e.g., original-stack-frame)
    /_next\//, // static assets and chunks
    /\.hot-update\./, // HMR
    /_rsc=/, // RSC data fetches
];

let provider: WebTracerProvider | undefined;

export function initBrowserTelemetry(config: BrowserTelemetryConfig) {
    if (provider) return;

    const {
        serviceName,
        serviceVersion,
        otelEndpoint,
        propagateToUrls = [/.*/],
        environment = 'development',
        captureConsole: shouldCaptureConsole = true,
        resourceAttributes = {},
        extraSpanProcessors = [],
        extraLogProcessors = [],
        ignoredUrls = [],
        nextjs = false,
    } = config;

    const endpoint = otelEndpoint?.replace(/\/$/, '');
    const hasEndpoint = !!endpoint;

    const resource = buildResource({
        serviceName,
        serviceVersion,
        environment,
        resourceAttributes,
    });

    const spanProcessors = [...extraSpanProcessors];

    if (hasEndpoint) {
        const batchProcessor = new BatchSpanProcessor(
            new OTLPTraceExporter({
                url: `${endpoint}/v1/traces`,
            }),
        );
        spanProcessors.push(new BrowserFilteringSpanProcessor(batchProcessor));
    }

    provider = new WebTracerProvider({
        resource,
        spanProcessors,
        sampler: new ParentBasedSampler({
            root: new TraceIdRatioBasedSampler(1.0),
        }),
    });

    provider.register({
        propagator: new CompositePropagator({
            propagators: [
                new W3CTraceContextPropagator(),
                new W3CBaggagePropagator(),
            ],
        }),
    });

    const otelSinkResult = hasEndpoint
        ? buildOtelLogSink({
              serviceName,
              serviceVersion,
              otelEndpoint,
              environment,
              resourceAttributes,
              extraLogProcessors,
          })
        : null;

    if (shouldCaptureConsole) {
        void initLogger({
            serviceName: config.serviceName,
            environment,
            otelSinkResult,
        });
    }

    const allIgnoredUrls = nextjs
        ? [...ignoredUrls, ...NEXTJS_IGNORED_URLS]
        : ignoredUrls;

    registerInstrumentations({
        instrumentations: [
            new FetchInstrumentation({
                propagateTraceHeaderCorsUrls: propagateToUrls,
                clearTimingResources: true,
                ignoreUrls: allIgnoredUrls,
            }),
            new XMLHttpRequestInstrumentation({
                propagateTraceHeaderCorsUrls: propagateToUrls,
                ignoreUrls: allIgnoredUrls,
            }),
        ],
    });
}

export async function shutdownBrowserTelemetry() {
    await Promise.all([provider?.shutdown(), shutdownLogger()]);
    provider = undefined;
}
