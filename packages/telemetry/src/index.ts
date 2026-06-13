import { initLogger, logger } from './logger';
import { initializeSdk } from './tracing';

let sdk: ReturnType<typeof initializeSdk> | undefined;

export function initTelemetry(config: {
    serviceName: string;
    otelEndpoint?: string;
}) {
    if (sdk) return;

    sdk = initializeSdk(config.serviceName, config.otelEndpoint);
    initLogger(config.serviceName, !!config.otelEndpoint);

    // Auto-register shutdown on SIGTERM/SIGINT
    const shutdown = () => {
        shutdownTelemetry()
            .then(() => process.exit(0))
            .catch(() => process.exit(1));
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
}

export async function shutdownTelemetry() {
    logger.end();
    await sdk?.shutdown();
}
