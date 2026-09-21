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

import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { BaseTelemetryConfig } from '../shared';

import { createOtlpExporter, defaultExportErrorHandler } from '../exporter';
import { PipelineSpanProcessor } from '../processor-base';
import {
    buildResource,
    createDefaultPropagator,
    createDefaultSampler,
    isProdEnv,
    normalizeEndpoint,
} from '../shared';
import { nextJsStages, redactionStage, scopeFilterStage } from './stages';

export interface TelemetryConfig extends BaseTelemetryConfig {
    /** Routes to ignore from telemetry tracing. */
    ignoredRoutes?: string[];
    /** URLs or domains to ignore from outbound telemetry tracing. */
    ignoredUrls?: string[];
    /** Tracer scope names to suppress entirely (e.g. 'better-auth'). */
    ignoredScopes?: string[];
    extraSpanProcessors?: SpanProcessor[];
    /** Enable Next.js specific telemetry filtering. */
    nextjs?: boolean;
    /** Fraction of traces to sample (0–1). Defaults to 1.0 (sample all). */
    sampleRatio?: number;
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

    const scope = scopeFilterStage({ ignoredScopes: config.ignoredScopes });
    const nextJs = nextJsStages({ enabled: config.nextjs });

    const spanProcessor = hasEndpoint
        ? new PipelineSpanProcessor(
              new BatchSpanProcessor(
                  createOtlpExporter(OTLPTraceExporter, {
                      endpoint,
                      signal: 'traces',
                      isProd,
                      onExportError: defaultExportErrorHandler,
                  }),
              ),
              [
                  scope.filter,
                  nextJs.noiseFilter,
                  nextJs.enrich,
                  redactionStage(),
                  scope.reparent,
              ],
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
                requestHook: (span, req) => {
                    if ('method' in req && 'url' in req) {
                        span.updateName(`${req.method} ${req.url}`);
                    }
                },
                ignoreIncomingRequestHook: (req) => {
                    if (req.method === 'OPTIONS') return true;
                    const url = req.url ?? '';
                    if (url === '/favicon.ico' || url === '/health')
                        return true;
                    if (config.ignoredRoutes?.some((r) => url.startsWith(r)))
                        return true;
                    if (config.nextjs) {
                        if (
                            url.includes('/_next/') ||
                            url.includes('__nextjs_') ||
                            url.includes('.hot-update.') ||
                            url.includes('_rsc=')
                        )
                            return true;
                    }
                    return false;
                },
                ignoreOutgoingRequestHook: (req) => {
                    const host = req.hostname ?? req.host ?? '';
                    const path = req.path ?? '';
                    const full = host + path;
                    if (config.ignoredUrls?.some((u) => full.includes(u)))
                        return true;
                    if (config.nextjs && full.includes('registry.npmjs.org'))
                        return true;
                    return false;
                },
            }),
            new PgInstrumentation(),
            new IORedisInstrumentation(),
            new UndiciInstrumentation({
                ignoreRequestHook: (req) => {
                    const full = (req.origin ?? '') + (req.path ?? '');
                    if (config.ignoredUrls?.some((u) => full.includes(u)))
                        return true;
                    if (config.nextjs && full.includes('registry.npmjs.org'))
                        return true;
                    return false;
                },
            }),
            new RuntimeNodeInstrumentation(),
        ],
    });

    sdk.start();

    if (config.nextjs) {
        // In Next.js standalone mode, the `http` module is imported BEFORE the
        // OpenTelemetry SDK (and its require-in-the-middle hooks) is initialized.
        // This results in missing HTTP spans because the hook never fires.
        // Calling process.getBuiltinModule forces the hook to retroactively patch it.
        // (We use process.getBuiltinModule rather than require() because Turbopack
        // statically rewrites require() calls).
        process.getBuiltinModule?.('node:http');
        process.getBuiltinModule?.('node:https');
    }

    return sdk;
}
