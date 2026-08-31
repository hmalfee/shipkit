import {
    CompositePropagator,
    W3CBaggagePropagator,
    W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
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

import type { Resource } from '@opentelemetry/resources';

export interface BaseTelemetryConfig {
    serviceName: string;
    serviceVersion?: string;
    otelEndpoint?: string;
    environment: string;
    resourceAttributes?: Record<string, string>;
}

export function isProdEnv(environment: string): boolean {
    return environment === 'production';
}

/** Strips a trailing slash. Used everywhere an OTLP endpoint is turned into a URL. */
export function normalizeEndpoint(
    endpoint: string | undefined,
): string | undefined {
    return endpoint?.replace(/\/$/, '');
}

export const PROPAGATION_HEADERS = ['traceparent', 'tracestate', 'baggage'];

export interface BuildResourceOptions {
    serviceName: string;
    serviceVersion?: string;
    environment: string;
    instanceId?: string;
    resourceAttributes?: Record<string, string>;
}

export function buildResource(options: BuildResourceOptions): Resource {
    return resourceFromAttributes({
        [ATTR_SERVICE_NAMESPACE]: 'shipkit',
        [ATTR_SERVICE_NAME]: options.serviceName,
        [ATTR_SERVICE_VERSION]: options.serviceVersion ?? 'unknown',
        [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: options.environment,
        ...(options.instanceId
            ? { [ATTR_SERVICE_INSTANCE_ID]: options.instanceId }
            : {}),
        ...options.resourceAttributes,
    });
}

export function createDefaultPropagator() {
    return new CompositePropagator({
        propagators: [
            new W3CTraceContextPropagator(),
            new W3CBaggagePropagator(),
        ],
    });
}

export function createDefaultSampler(ratio = 1.0) {
    return new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(ratio),
    });
}
