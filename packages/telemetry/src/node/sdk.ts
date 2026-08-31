import crypto from 'node:crypto';

import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

import type {
    ReadableSpan,
    SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type { BaseTelemetryConfig } from '../shared';

import { createOtlpExporter, defaultExportErrorHandler } from '../exporter';
import { DelegatingSpanProcessor } from '../processor-base';
import {
    buildResource,
    createDefaultPropagator,
    createDefaultSampler,
    isProdEnv,
    normalizeEndpoint,
} from '../shared';
import {
    enrichNextSpan,
    isNoisyNextSpan,
    matchesIgnoredRoute,
    matchesIgnoredUrl,
    shouldIgnoreNextIncomingRequest,
} from './next';

export interface TelemetryConfig extends BaseTelemetryConfig {
    /** Routes to ignore from telemetry tracing. */
    ignoredRoutes?: string[];
    /** URLs or domains to ignore from outbound telemetry tracing. */
    ignoredUrls?: string[];
    extraSpanProcessors?: SpanProcessor[];
    /** Enable Next.js specific telemetry filtering. */
    nextjs?: boolean;
    /** Fraction of traces to sample (0–1). Defaults to 1.0 (sample all). */
    sampleRatio?: number;
}

interface FilteringSpanProcessorOptions {
    ignoredRoutes?: string[];
    ignoredUrls?: string[];
    nextjs?: boolean;
}

class FilteringSpanProcessor extends DelegatingSpanProcessor {
    private readonly ignoredRoutes: string[];
    private readonly ignoredUrls: string[];
    private readonly nextjs: boolean;

    constructor(
        delegate: SpanProcessor,
        options: FilteringSpanProcessorOptions = {},
    ) {
        super(delegate);
        this.ignoredRoutes = options.ignoredRoutes ?? [];
        this.ignoredUrls = options.ignoredUrls ?? [];
        this.nextjs = options.nextjs ?? false;
    }

    override onEnd(span: ReadableSpan): void {
        if (this.nextjs && isNoisyNextSpan(span)) return;
        if (matchesIgnoredUrl(span, this.ignoredUrls)) return;
        if (this.nextjs) enrichNextSpan(span); // enrich only survivors, before the route check below
        if (matchesIgnoredRoute(span, this.ignoredRoutes)) return;
        this._delegate.onEnd(span);
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

    const isProd = isProdEnv(environment);
    const endpoint = normalizeEndpoint(config.otelEndpoint);
    const hasEndpoint = !!endpoint;

    const spanProcessor = hasEndpoint
        ? new FilteringSpanProcessor(
              new BatchSpanProcessor(
                  createOtlpExporter(OTLPTraceExporter, {
                      endpoint,
                      signal: 'traces',
                      isProd,
                      onExportError: defaultExportErrorHandler,
                  }),
              ),
              {
                  ignoredRoutes: config.ignoredRoutes,
                  ignoredUrls: config.ignoredUrls,
                  nextjs: config.nextjs,
              },
          )
        : undefined;

    const metricReader = hasEndpoint
        ? new PeriodicExportingMetricReader({
              exporter: createOtlpExporter(OTLPMetricExporter, {
                  endpoint,
                  signal: 'metrics',
                  isProd,
                  onExportError: defaultExportErrorHandler,
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
        textMapPropagator: createDefaultPropagator(),
        sampler: createDefaultSampler(config.sampleRatio),
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

                    // Single source of truth for "is this Next.js internal noise" — see integrations/nextjs.ts.
                    if (config.nextjs)
                        return shouldIgnoreNextIncomingRequest(url);

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
