import crypto from 'node:crypto';

import {
    CompositePropagator,
    W3CBaggagePropagator,
    W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
    ParentBasedSampler,
    TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import {
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import {
    ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
    ATTR_SERVICE_INSTANCE_ID,
    ATTR_SERVICE_NAMESPACE,
} from '@opentelemetry/semantic-conventions/incubating';

export function initializeSdk(serviceName: string, otelEndpoint?: string) {
    const instanceId = crypto.randomUUID();
    // oxlint-disable-next-line eslint-js/no-restricted-syntax
    const environment = process.env.NODE_ENV ?? 'unknown';

    const resource = resourceFromAttributes({
        [ATTR_SERVICE_NAMESPACE]: 'mento-mark',
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]: 'N/A',
        [ATTR_SERVICE_INSTANCE_ID]: instanceId,
        [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: environment,
    });

    const isProd = environment === 'production';
    const hasEndpoint = !!otelEndpoint;

    const metricReader = hasEndpoint
        ? new PeriodicExportingMetricReader({
              exporter: new OTLPMetricExporter({
                  timeoutMillis: isProd ? 15000 : 5000,
              }),
              exportIntervalMillis: 60_000,
          })
        : undefined;

    // Do NOT pass `url` below. OTel SDK will automatically read OTEL_EXPORTER_OTLP_ENDPOINT
    // and append `/v1/traces`, `/v1/metrics` or `/v1/logs`. If we passed `url` explicitly, it would send
    // to the base endpoint.
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
        traceExporter: hasEndpoint
            ? new OTLPTraceExporter({
                  timeoutMillis: isProd ? 15000 : 5000,
              })
            : undefined,
        logRecordProcessors: hasEndpoint
            ? [
                  new BatchLogRecordProcessor(
                      new OTLPLogExporter({
                          timeoutMillis: isProd ? 15000 : 5000,
                      }),
                  ),
              ]
            : undefined,
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
