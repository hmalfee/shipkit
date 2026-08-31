import { ExportResultCode } from '@opentelemetry/core';

import { logger } from './logger';

interface Exporter {
    export(
        items: unknown,
        resultCallback: (result: {
            code: ExportResultCode;
            error?: Error;
        }) => void,
    ): void;
}

interface ExportErrorOptions {
    kind: string; // 'traces' | 'logs' | 'metrics'
    url: string;
    onError: (message: string, meta: Record<string, unknown>) => void;
}

type OtlpSignal = 'traces' | 'metrics' | 'logs';
const TIMEOUT_MS = { prod: 15_000, dev: 5_000 } as const;

export interface CreateOtlpExporterOptions {
    endpoint: string;
    signal: OtlpSignal;
    isProd: boolean;
    onExportError?: (message: string, meta: Record<string, unknown>) => void;
}

/**
 * Every OTLP exporter in this package gets built the same way: same URL
 * convention, same env-aware timeout, same export-failure logging.
 */
export function createOtlpExporter<T extends Exporter>(
    ExporterCtor: new (opts: { url: string; timeoutMillis?: number }) => T,
    { endpoint, signal, isProd, onExportError }: CreateOtlpExporterOptions,
): T {
    const url = `${endpoint}/v1/${signal}`;
    const exporter = new ExporterCtor({
        url,
        timeoutMillis: isProd ? TIMEOUT_MS.prod : TIMEOUT_MS.dev,
    });
    return onExportError
        ? withExportErrorLogging(exporter, {
              kind: signal,
              url,
              onError: onExportError,
          })
        : exporter;
}

export function defaultExportErrorHandler(
    message: string,
    meta: Record<string, unknown>,
): void {
    return logger.error`[telemetry] ${message} ${meta}`;
}

/**
 * Wraps any OTLP exporter so failed exports call `onError`.
 * Replaces CustomOTLPLogExporter / CustomOTLPTraceExporter / CustomOTLPMetricExporter.
 */
function withExportErrorLogging<T extends Exporter>(
    inner: T,
    opts: ExportErrorOptions,
): T {
    // Proxy (not a plain wrapper) so exporters using private class fields keep `this` bound to
    // the real target — required for OTLPExporter classes that access private fields in shutdown().
    return new Proxy(inner, {
        get(target, prop, receiver) {
            if (prop === 'export') {
                return (
                    items: unknown,
                    callback: (result: {
                        code: ExportResultCode;
                        error?: Error;
                    }) => void,
                ) => {
                    target.export(items, (result) => {
                        if (result.code !== ExportResultCode.SUCCESS) {
                            const err = result.error as
                                | (Error & { code?: number; data?: string })
                                | undefined;
                            opts.onError(
                                `[Telemetry] Failed to export ${opts.kind} to ${opts.url}`,
                                {
                                    code: result.code,
                                    error: err?.message ?? String(result.error),
                                    stack: err?.stack,
                                    ...(err?.code !== undefined && {
                                        httpStatus: err.code,
                                    }),
                                    ...(err?.data && {
                                        responseBody: err.data,
                                    }),
                                },
                            );
                        }
                        callback(result);
                    });
                };
            }
            const value = Reflect.get(target, prop, receiver) as unknown;
            // Bind so shutdown()/forceFlush() etc. run with `this === target`,
            // not the proxy — required for classes using private fields.
            return typeof value === 'function'
                ? (value as (...args: unknown[]) => unknown).bind(target)
                : value;
        },
    });
}
