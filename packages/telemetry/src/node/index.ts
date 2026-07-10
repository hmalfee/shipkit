import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import type { TelemetryConfig } from './sdk';

import { initLogger, shutdownLogger } from '../logger';
import { initializeSdk } from './sdk';

export type { TelemetryConfig };

interface InitTelemetryConfig extends Omit<TelemetryConfig, 'environment'> {
    environment?: string;
    extraLogProcessors?: LogRecordProcessor[];
}

let sdk: ReturnType<typeof initializeSdk> | undefined;
let initializing: Promise<void> | undefined;

export function initTelemetry(config: InitTelemetryConfig) {
    initializing ??= initTelemetryOnce(config);
    return initializing;
}

async function initTelemetryOnce(config: InitTelemetryConfig) {
    const environment = config.environment ?? 'development';

    const fullConfig = { ...config, environment };

    sdk = initializeSdk(fullConfig);

    await initLogger({
        serviceName: fullConfig.serviceName,
        serviceVersion: fullConfig.serviceVersion,
        otelEndpoint: fullConfig.otelEndpoint,
        environment: fullConfig.environment,
        resourceAttributes: fullConfig.resourceAttributes,
        extraLogProcessors: fullConfig.extraLogProcessors,
    });

    const shutdown = () => {
        shutdownTelemetry()
            .then(() => process.exit(0))
            .catch(() => process.exit(1));
    };

    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
}

export async function shutdownTelemetry() {
    await Promise.all([sdk?.shutdown(), shutdownLogger()]);
}

export * from './spans';
