import { resourceFromAttributes } from '@opentelemetry/resources';
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
        [ATTR_SERVICE_NAMESPACE]: 'mento-mark',
        [ATTR_SERVICE_NAME]: options.serviceName,
        [ATTR_SERVICE_VERSION]: options.serviceVersion ?? 'unknown',
        [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: options.environment,
        ...(options.instanceId
            ? { [ATTR_SERVICE_INSTANCE_ID]: options.instanceId }
            : {}),
        ...options.resourceAttributes,
    });
}
