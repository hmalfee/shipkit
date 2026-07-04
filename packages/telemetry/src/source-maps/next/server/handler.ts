import { existsSync } from 'node:fs';

import { getLogger } from '@logtape/logtape';
import { NextResponse } from 'next/server';
import protobuf from 'protobufjs';

import type { NextRequest } from 'next/server';
import type { OtlpLogsRequest, OtlpTraceRequest } from './attr-utils';
import type { SourceMapResolver } from './resolver';
import type { SourceMapStore } from './store';

import descriptor from './otlp-descriptor.json';
import { resolveExceptionLogs, resolveExceptionStackTraces } from './resolve';
import { createSourceMapResolver } from './resolver';
import { createSqliteStore, DEFAULT_DB_PATH } from './store';

const logger = getLogger(['telemetry', 'sourcemaps']);
// oxlint-disable-next-line eslint-js/no-restricted-syntax
const isProd = process.env.NODE_ENV === 'production';

let cachedRoot: protobuf.Root | null = null;

function getProtoRoot(): protobuf.Root {
    if (cachedRoot) return cachedRoot;
    cachedRoot = protobuf.Root.fromJSON(descriptor as protobuf.INamespace);
    return cachedRoot;
}

const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MB
const COLLECTOR_TIMEOUT_MS = 10_000;

/**
 * Creates a Next.js API route handler that acts as a proxy for OpenTelemetry ingestion.
 *
 * It intercepts incoming OTLP payload requests (Protobuf format) from the client (browser),
 * extracts any `exception.stacktrace.debug_id_maps` appended by `DebugIdEnrichingSpanProcessor`,
 * resolves the client-side stack traces using the local SQLite source maps database,
 * and forwards the enriched payload to your actual OTLP backend.
 *
 * In addition to source map resolution, this acts as a reliable first-party proxy to
 * bypass ad blockers that might otherwise block direct requests to external telemetry endpoints.
 *
 * @param otelEndpoint - The actual OpenTelemetry collector endpoint to forward traffic to.
 */
export function createOtelIngestHandler(otelEndpoint: string | undefined) {
    let store: SourceMapStore | null = null;
    let resolver: SourceMapResolver | null = null;
    let resolverChecked = false;

    function getResolver(): SourceMapResolver | null {
        if (resolverChecked) return resolver;

        const exists = existsSync(DEFAULT_DB_PATH);

        if (!exists) {
            const msg = `Telemetry SourceMaps Database not found at ${DEFAULT_DB_PATH}. Client-side exception stacktraces will not be resolved.`;
            if (isProd) logger.error(msg);
            else logger.warn(msg);
            return null;
        }

        try {
            store = createSqliteStore(DEFAULT_DB_PATH);
            resolver = createSourceMapResolver((id) => store!.get(id));
            resolverChecked = true;
            return resolver;
        } catch (error) {
            logger.error(
                `Failed to initialize SourceMaps database: ${error instanceof Error ? error.message : String(error)}`,
            );
            return null;
        }
    }

    let cleanupRegistered = false;
    if (typeof process !== 'undefined' && !cleanupRegistered) {
        cleanupRegistered = true;
        const cleanup = () => {
            resolver?.close();
            store?.close?.();
            resolver = null;
            store = null;
        };
        process.once('SIGTERM', cleanup);
        process.once('SIGINT', cleanup);
    }

    return async function handler(
        req: NextRequest,
        context: {
            params?: { path?: string[] } | Promise<{ path?: string[] }>;
        },
    ) {
        if (!otelEndpoint) {
            return new NextResponse('No OTel endpoint configured', {
                status: 500,
            });
        }

        const resolvedParams = await context.params;
        const pathSegments = resolvedParams?.path ?? [];
        const joinedPath = pathSegments.join('/');
        const targetUrl = `${otelEndpoint.replace(/\/$/, '')}/${joinedPath}`;
        const contentType = req.headers.get('content-type') ?? '';
        const isProto = contentType.includes('application/x-protobuf');

        if (
            req.method === 'POST' &&
            isProto &&
            (joinedPath === 'v1/traces' || joinedPath === 'v1/logs')
        ) {
            const contentLength = parseInt(
                req.headers.get('content-length') ?? '0',
                10,
            );
            if (contentLength > MAX_BODY_BYTES) {
                return new NextResponse('Payload too large', { status: 413 });
            }

            const body = new Uint8Array(await req.arrayBuffer());
            let forwardBody: Uint8Array = body;

            try {
                const root = getProtoRoot();
                const res = getResolver();
                const isTraces = joinedPath === 'v1/traces';
                const typeName = isTraces
                    ? 'opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest'
                    : 'opentelemetry.proto.collector.logs.v1.ExportLogsServiceRequest';

                const T = root.lookupType(typeName);
                const message = T.decode(body);

                if (res) {
                    const obj = T.toObject(message, {
                        defaults: true,
                    }) as OtlpTraceRequest | OtlpLogsRequest;

                    try {
                        if (isTraces) {
                            resolveExceptionStackTraces(
                                obj as OtlpTraceRequest,
                                res,
                            );
                        } else {
                            resolveExceptionLogs(obj as OtlpLogsRequest, res);
                        }
                    } catch {
                        // silently ignore resolution errors, forward the original message
                    }
                    forwardBody = T.encode(T.fromObject(obj)).finish();
                } else {
                    forwardBody = T.encode(message).finish();
                }
            } catch {
                // silently ignore decoding errors, forward the original message
            }

            try {
                const response = await fetch(targetUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-protobuf' },
                    body: forwardBody as unknown as BodyInit,
                    signal: AbortSignal.timeout(COLLECTOR_TIMEOUT_MS),
                });
                return new NextResponse(null, {
                    status: response.ok ? 200 : response.status,
                });
            } catch (err) {
                if (
                    err instanceof DOMException &&
                    err.name === 'TimeoutError'
                ) {
                    return new NextResponse('Collector timeout', {
                        status: 504,
                    });
                }
                return new NextResponse('Collector unreachable', {
                    status: 502,
                });
            }
        }

        const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
        const bodyText = hasBody ? await req.text() : undefined;

        try {
            const response = await fetch(targetUrl, {
                method: req.method,
                headers: {
                    'Content-Type': contentType || 'application/json',
                },
                body: bodyText,
                signal: AbortSignal.timeout(COLLECTOR_TIMEOUT_MS),
            });

            const cleanedHeaders = new Headers(response.headers);
            cleanedHeaders.delete('content-encoding');
            cleanedHeaders.delete('content-length');
            cleanedHeaders.delete('content-disposition');

            return new NextResponse(response.body, {
                status: response.status,
                headers: cleanedHeaders,
            });
        } catch (err) {
            if (err instanceof DOMException && err.name === 'TimeoutError') {
                return new NextResponse('Collector timeout', { status: 504 });
            }
            return new NextResponse('Collector unreachable', { status: 502 });
        }
    };
}
