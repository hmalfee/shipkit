import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';

import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import type {
    ReadableSpan,
    SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type { BaseTelemetryConfig } from '../shared';

import { createOtlpExporter, defaultExportErrorHandler } from '../exporter';
import { initLogger } from '../logger';
import { buildOtelLogSink } from '../logger/otel-sink';
import { DelegatingSpanProcessor } from '../processor-base';
import {
    buildResource,
    createDefaultPropagator,
    createDefaultSampler,
    isProdEnv,
    normalizeEndpoint,
} from '../shared';

const NEXTJS_IGNORED_URLS: (string | RegExp)[] = [
    /__nextjs_/, // internal Next.js requests (e.g., original-stack-frame)
    /_next\//, // static assets and chunks
    /\.hot-update\./, // HMR
    /_rsc=/, // RSC data fetches
];

class BrowserFilteringSpanProcessor extends DelegatingSpanProcessor {
    override onEnd(span: ReadableSpan): void {
        // Drop aborted/cancelled fetches (status 0 = request never completed).
        // Framework-agnostic — happens with React navigation, StrictMode, any SPA.
        if (span.attributes['http.status_code'] === 0) return;
        this._delegate.onEnd(span);
    }
}

interface BrowserTelemetryConfig extends BaseTelemetryConfig {
    propagateToUrls?: RegExp[];
    captureConsole?: boolean;
    extraSpanProcessors?: SpanProcessor[];
    extraLogProcessors?: LogRecordProcessor[];
    ignoredUrls?: (string | RegExp)[];
    /** Enable Next.js specific telemetry filtering. */
    nextjs?: boolean;
    /** Fraction of traces to sample (0–1). Defaults to 1.0 (sample all). */
    sampleRatio?: number;
}

let provider: WebTracerProvider | undefined;

/** Registers the browser WebTracerProvider and logging subsystem. Call once at the top of the client instrumentation entry point. */
export function initBrowserTelemetry(config: BrowserTelemetryConfig) {
    if (provider) return;

    const {
        serviceName,
        serviceVersion,
        otelEndpoint,
        propagateToUrls = [/.*/],
        environment,
        captureConsole: shouldCaptureConsole = true,
        resourceAttributes = {},
        extraSpanProcessors = [],
        extraLogProcessors = [],
        ignoredUrls = [],
        nextjs = false,
    } = config;

    const endpoint = normalizeEndpoint(otelEndpoint);
    const hasEndpoint = !!endpoint;

    const resource = buildResource({
        serviceName,
        serviceVersion,
        environment,
        resourceAttributes,
    });

    const spanProcessors = [...extraSpanProcessors];

    if (hasEndpoint) {
        spanProcessors.push(
            new BrowserFilteringSpanProcessor(
                new BatchSpanProcessor(
                    createOtlpExporter(OTLPTraceExporter, {
                        endpoint,
                        signal: 'traces',
                        isProd: isProdEnv(environment),
                        onExportError: defaultExportErrorHandler,
                    }),
                ),
            ),
        );
    }

    provider = new WebTracerProvider({
        resource,
        spanProcessors,
        sampler: createDefaultSampler(config.sampleRatio),
    });

    provider.register({ propagator: createDefaultPropagator() });

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
            serviceName,
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
