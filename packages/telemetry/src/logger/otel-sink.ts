import { getOpenTelemetrySink } from '@logtape/otel';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import {
    BatchLogRecordProcessor,
    LoggerProvider,
} from '@opentelemetry/sdk-logs';

import type { LogRecord, Sink } from '@logtape/logtape';
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import type { BaseTelemetryConfig } from '../shared';

import { createOtlpExporter, defaultExportErrorHandler } from '../exporter';
import { buildResource, isProdEnv, normalizeEndpoint } from '../shared';

export interface OtelLoggerConfig extends BaseTelemetryConfig {
    extraLogProcessors?: LogRecordProcessor[];
    /** Called when the OTLP log exporter fails. Defaults to console.error. */
    onExportError?: (message: string, meta: Record<string, unknown>) => void;
}

export interface OtelLogSinkResult {
    loggerProvider: LoggerProvider;
    sink: Sink;
}

/**
 * Wraps a sink to append the error message (if present) to the log body.
 * Ensures structured log backends (OTEL) include the error message inline.
 */
function withErrorMessage(inner: Sink): Sink {
    return (record: LogRecord) => {
        const error = record.properties?.error ?? record.properties?.err;
        if (error instanceof Error) {
            const msg = [...record.message];
            msg[msg.length - 1] =
                `${String(msg[msg.length - 1])} ${error.message}`;
            inner({ ...record, message: msg });
            return;
        }
        inner(record);
    };
}

export function buildOtelLogSink(
    config: OtelLoggerConfig,
): OtelLogSinkResult | null {
    const endpoint = normalizeEndpoint(config.otelEndpoint);
    if (!endpoint) return null;

    const exporter = createOtlpExporter(OTLPLogExporter, {
        endpoint,
        signal: 'logs',
        isProd: isProdEnv(config.environment),
        onExportError: config.onExportError ?? defaultExportErrorHandler,
    });

    const loggerProvider = new LoggerProvider({
        resource: buildResource({
            serviceName: config.serviceName,
            serviceVersion: config.serviceVersion,
            environment: config.environment,
            resourceAttributes: config.resourceAttributes,
        }),
        processors: [
            ...(config.extraLogProcessors ?? []),
            new BatchLogRecordProcessor(exporter),
        ],
    });

    return {
        loggerProvider,
        sink: withErrorMessage(
            getOpenTelemetrySink({
                loggerProvider,
                exceptionAttributes: 'semconv',
            }),
        ),
    };
}
