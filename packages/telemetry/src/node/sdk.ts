import crypto from 'node:crypto';

import {
    CompositePropagator,
    ExportResultCode,
    W3CBaggagePropagator,
    W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
    BatchSpanProcessor,
    ParentBasedSampler,
    TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';

import type { Context } from '@opentelemetry/api';
import type {
    ReadableSpan,
    Span,
    SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

import { logger } from '../logger';
import { buildResource } from '../shared';

export type SpanFilter = (span: ReadableSpan) => boolean;

export type RouteExtractor = (span: ReadableSpan) => string | undefined;

export interface TelemetryConfig {
    serviceName: string;
    serviceVersion?: string;
    otelEndpoint?: string;
    environment: string;
    /** Routes to ignore from telemetry tracing. */
    ignoredRoutes?: string[];
    resourceAttributes?: Record<string, string>;
    extraSpanProcessors?: SpanProcessor[];
    spanFilters?: SpanFilter[];
    routeExtractors?: RouteExtractor[];
}

class FilteringSpanProcessor implements SpanProcessor {
    constructor(
        private readonly _delegate: SpanProcessor,
        private readonly _ignoredRoutes: string[] = [],
        private readonly _otelEndpoint?: string,
        private readonly _spanFilters: SpanFilter[] = [],
        private readonly _routeExtractors: RouteExtractor[] = [],
    ) {}

    onStart(span: Span, context: Context): void {
        this._delegate.onStart(span, context);
    }

    onEnd(span: ReadableSpan): void {
        if (this._spanFilters.some((filter) => filter(span))) {
            return;
        }

        const url = span.attributes['http.url'] ?? span.attributes['url.full'];
        if (typeof url === 'string') {
            if (this._otelEndpoint && url.includes(this._otelEndpoint)) {
                return;
            }
        }

        const target =
            span.attributes['http.target'] ?? span.attributes['url.path'];
        const route =
            span.attributes['http.route'] ??
            this._routeExtractors.reduce<string | undefined>(
                (found, extractor) => found ?? extractor(span),
                undefined,
            );

        if (
            this._ignoredRoutes.some(
                (r) =>
                    (typeof target === 'string' && target.startsWith(r)) ||
                    (typeof route === 'string' && route.startsWith(r)),
            )
        ) {
            return;
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

// Wrapper for trace exporter
class CustomOTLPTraceExporter extends OTLPTraceExporter {
    public readonly customUrl: string;

    constructor(config: { url: string; timeoutMillis?: number }) {
        super(config);
        this.customUrl = config.url;
    }

    override export(
        items: unknown,
        resultCallback: (result: {
            code: ExportResultCode;
            error?: Error;
        }) => void,
    ): void {
        super.export(
            items as Parameters<OTLPTraceExporter['export']>[0],
            (result) => {
                if (result.code !== ExportResultCode.SUCCESS) {
                    logger.error(
                        `[Telemetry] Failed to export traces to OTEL endpoint: ${this.customUrl}\nError: ${result.error?.message ?? 'Unknown error'}\n`,
                        { ...result },
                    );
                }
                resultCallback(result);
            },
        );
    }
}

// Wrapper for metric exporter
class CustomOTLPMetricExporter extends OTLPMetricExporter {
    public readonly customUrl: string;

    constructor(config: { url: string; timeoutMillis?: number }) {
        super(config);
        this.customUrl = config.url;
    }

    override export(
        items: unknown,
        resultCallback: (result: {
            code: ExportResultCode;
            error?: Error;
        }) => void,
    ): void {
        super.export(
            items as Parameters<OTLPMetricExporter['export']>[0],
            (result) => {
                if (result.code !== ExportResultCode.SUCCESS) {
                    logger.error(
                        `[Telemetry] Failed to export metrics to OTEL endpoint: ${this.customUrl}\nError: ${result.error?.message ?? 'Unknown error'}\n`,
                        { ...result },
                    );
                }
                resultCallback(result);
            },
        );
    }
}

export function initializeSdk(config: TelemetryConfig) {
    const environment = config.environment;

    const resource = buildResource({
        serviceName: config.serviceName,
        serviceVersion: config.serviceVersion,
        environment,
        instanceId: crypto.randomUUID(),
        resourceAttributes: config.resourceAttributes,
    });

    const isProd = environment === 'production';
    const endpoint = config.otelEndpoint?.replace(/\/$/, '');
    const hasEndpoint = !!endpoint;

    const spanProcessor = hasEndpoint
        ? new FilteringSpanProcessor(
              new BatchSpanProcessor(
                  new CustomOTLPTraceExporter({
                      url: `${endpoint}/v1/traces`,
                      timeoutMillis: isProd ? 15000 : 5000,
                  }),
              ),
              config.ignoredRoutes,
              endpoint,
              config.spanFilters,
              config.routeExtractors,
          )
        : undefined;

    const metricReader = hasEndpoint
        ? new PeriodicExportingMetricReader({
              exporter: new CustomOTLPMetricExporter({
                  url: `${endpoint}/v1/metrics`,
                  timeoutMillis: isProd ? 15000 : 5000,
              }),
              exportIntervalMillis: 60_000,
          })
        : undefined;

    const spanProcessors = [...(config.extraSpanProcessors ?? [])];
    if (spanProcessor) {
        spanProcessors.push(spanProcessor);
    }

    const sdk = new NodeSDK({
        resource,
        textMapPropagator: new CompositePropagator({
            propagators: [
                new W3CTraceContextPropagator(),
                new W3CBaggagePropagator(),
            ],
        }),
        sampler: new ParentBasedSampler({
            root: new TraceIdRatioBasedSampler(1.0),
        }),
        metricReader,
        spanProcessors,
        instrumentations: [
            new HttpInstrumentation({
                ignoreIncomingRequestHook: (req) => {
                    const ignoredPaths = ['/', '/favicon.ico', '/health'];
                    return ignoredPaths.includes(req.url ?? '');
                },
            }),
            new PgInstrumentation(),
            new IORedisInstrumentation(),
            new UndiciInstrumentation(),
            new RuntimeNodeInstrumentation(),
        ],
    });

    sdk.start();

    return sdk;
}
