import { OpenTelemetryTransportV3 } from '@opentelemetry/winston-transport';
import winston from 'winston';

import { consoleFormat, otelFormat } from './formats';

let internalLogger: winston.Logger | null = null;

function createWinstonLogger(serviceName?: string, otelTransport?: boolean) {
    const transports: winston.transport[] = [
        new winston.transports.Console({
            format: consoleFormat,
        }),
    ];

    // Explicitly add the OTel transport if an endpoint is configured
    if (otelTransport) {
        transports.push(new OpenTelemetryTransportV3());
    }

    return winston.createLogger({
        level: 'silly',
        defaultMeta: serviceName ? { service: serviceName } : undefined,
        format: winston.format.combine(
            winston.format.errors({ stack: true }),
            otelFormat,
        ),
        transports,
    });
}

// Initialize a default logger without service name for early logs
internalLogger = createWinstonLogger();

export const logger = new Proxy({} as winston.Logger, {
    get(_target, prop: string | symbol, receiver: unknown): unknown {
        internalLogger ??= createWinstonLogger();
        const value: unknown = Reflect.get(internalLogger, prop, receiver);
        if (typeof value === 'function') {
            const fn = value as (...args: unknown[]) => unknown;
            return fn.bind(internalLogger);
        }
        return value;
    },
});

export function initLogger(serviceName: string, otelTransport?: boolean) {
    internalLogger = createWinstonLogger(serviceName, otelTransport);
}
