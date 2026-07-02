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

import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';

import { initLogger, shutdownLogger } from '../logger';
import { buildOtelLogSink } from '../logger/config';
import { buildResource } from '../shared';

const DEFAULT_IGNORED_URLS: (string | RegExp)[] = [
    /\/v1\/traces/,
    /\/v1\/logs/,
    /\/v1\/metrics/,
];

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
}

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
        spanProcessors.push(
            new BatchSpanProcessor(
                new OTLPTraceExporter({
                    url: `${endpoint}/v1/traces`,
                }),
            ),
        );
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

    registerInstrumentations({
        instrumentations: [
            new FetchInstrumentation({
                propagateTraceHeaderCorsUrls: propagateToUrls,
                clearTimingResources: true,
                ignoreUrls: [...DEFAULT_IGNORED_URLS, ...ignoredUrls],
            }),
            new XMLHttpRequestInstrumentation({
                propagateTraceHeaderCorsUrls: propagateToUrls,
                ignoreUrls: [...DEFAULT_IGNORED_URLS, ...ignoredUrls],
            }),
        ],
    });
}

export async function shutdownBrowserTelemetry() {
    await Promise.all([provider?.shutdown(), shutdownLogger()]);
    provider = undefined;
}
