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

export interface TelemetryConfig {
    serviceName: string;
    serviceVersion?: string;
    otelEndpoint?: string;
    environment: string;
    /** Routes to ignore from telemetry tracing. */
    ignoredRoutes?: string[];
    /** URLs or domains to ignore from outbound telemetry tracing. */
    ignoredUrls?: string[];
    resourceAttributes?: Record<string, string>;
    extraSpanProcessors?: SpanProcessor[];
    /** Enable Next.js specific telemetry filtering. */
    nextjs?: boolean;
}

const NOISY_NEXT_SPAN_TYPES = new Set([
    'NextNodeServer.getLayoutOrPageModule',
    'NextNodeServer.createComponentTree',
    'NextNodeServer.findPageComponents',
    'NextNodeServer.startResponse',
    'NextNodeServer.clientComponentLoading',
    'NextNodeServer.getRequestHandler',
]);

class FilteringSpanProcessor implements SpanProcessor {
    constructor(
        private readonly _delegate: SpanProcessor,
        private readonly _ignoredRoutes: string[] = [],
        private readonly _ignoredUrls: string[] = [],
        private readonly _nextjs = false,
    ) {}

    onStart(span: Span, context: Context): void {
        this._delegate.onStart(span, context);
    }

    onEnd(span: ReadableSpan): void {
        const url = span.attributes['http.url'] ?? span.attributes['url.full'];
        const target =
            span.attributes['http.target'] ?? span.attributes['url.path'];

        if (this._nextjs) {
            const spanType = span.attributes['next.span_type'];
            if (
                typeof spanType === 'string' &&
                NOISY_NEXT_SPAN_TYPES.has(spanType)
            )
                return;

            if (typeof url === 'string' && url.includes('registry.npmjs.org'))
                return;

            if (
                typeof target === 'string' &&
                (target.startsWith('/_next/') ||
                    target.includes('__nextjs_') ||
                    target.includes('.hot-update.'))
            )
                return;
        }

        if (typeof url === 'string') {
            if (
                this._ignoredUrls.some((ignoredUrl) => url.includes(ignoredUrl))
            ) {
                return;
            }
        }

        let route = span.attributes['http.route'];
        if (this._nextjs) {
            const nextRoute = span.attributes['next.route'];
            if (typeof nextRoute === 'string') {
                route ??= nextRoute;
                // Mutate the attributes object to ensure APM tools see the route
                span.attributes['http.route'] = route;
            }

            const spanType = span.attributes['next.span_type'];
            if (typeof spanType === 'string') {
                const method = span.attributes['http.method'];
                const attrs = span.attributes;

                if (spanType === 'BaseServer.handleRequest') {
                    // Enrich operation and resource names
                    attrs['operation.name'] =
                        typeof method === 'string' ? method : 'HTTP_REQUEST';

                    if (typeof route === 'string') {
                        attrs['resource.name'] = route;

                        // RSC-aware span naming
                        if (
                            attrs['next.rsc'] &&
                            typeof method === 'string' &&
                            !span.name.startsWith('RSC ')
                        ) {
                            (span as unknown as { name: string }).name =
                                `RSC ${method} ${route}`;
                        }
                    }
                } else {
                    attrs['operation.name'] = `next_js.${spanType}`;
                }
            }
        }

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
              config.ignoredUrls,
              config.nextjs,
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
                    if (req.method === 'OPTIONS') {
                        return true;
                    }

                    const url = req.url ?? '';
                    if (url === '/favicon.ico' || url === '/health') {
                        return true;
                    }

                    if (config.nextjs) {
                        return (
                            url.startsWith('/_next/') ||
                            url.includes('__nextjs_')
                        );
                    }

                    return url === '/';
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
