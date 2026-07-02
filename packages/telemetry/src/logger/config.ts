import { getOpenTelemetrySink } from '@logtape/otel';
import { DEFAULT_REDACT_FIELDS, redactByField } from '@logtape/redaction';
import { ExportResultCode } from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import {
    BatchLogRecordProcessor,
    LoggerProvider,
} from '@opentelemetry/sdk-logs';

import type { LogRecord, Sink } from '@logtape/logtape';
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';

import { logger } from '.';
import { buildResource } from '../shared';

export interface LoggerConfig {
    serviceName: string;
    serviceVersion?: string;
    otelEndpoint?: string;
    environment: string;
    resourceAttributes?: Record<string, string>;
    extraLogProcessors?: LogRecordProcessor[];
}

export interface OtelLogSinkResult {
    loggerProvider: LoggerProvider;
    sink: Sink;
}

// Wrapper to catch and log export errors
class CustomOTLPLogExporter extends OTLPLogExporter {
    public readonly customUrl: string;

    constructor(config: { url: string }) {
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
            items as Parameters<OTLPLogExporter['export']>[0],
            (result) => {
                if (result.code !== ExportResultCode.SUCCESS) {
                    logger.error(
                        `[Telemetry] Failed to export logs to OTEL endpoint: ${this.customUrl}\n`,
                        { ...result },
                    );
                }
                resultCallback(result);
            },
        );
    }
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
    config: LoggerConfig,
): OtelLogSinkResult | null {
    const endpoint = config.otelEndpoint?.replace(/\/$/, '');
    if (!endpoint) return null;

    const loggerProvider = new LoggerProvider({
        resource: buildResource({
            serviceName: config.serviceName,
            serviceVersion: config.serviceVersion,
            environment: config.environment,
            resourceAttributes: config.resourceAttributes,
        }),
        processors: [
            ...(config.extraLogProcessors ?? []),
            new BatchLogRecordProcessor(
                new CustomOTLPLogExporter({ url: `${endpoint}/v1/logs` }),
            ),
        ],
    });

    return {
        loggerProvider,
        sink: withErrorMessage(
            redactByField(
                getOpenTelemetrySink({
                    loggerProvider,
                    exceptionAttributes: 'semconv',
                }),
                {
                    fieldPatterns: DEFAULT_REDACT_FIELDS,
                    action: () => '[REDACTED]',
                },
            ),
        ),
    };
}
