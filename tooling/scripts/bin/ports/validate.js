import { registry } from './registry.js';

const MIN_PORT = 1;
const MAX_PORT = 65535;
const RESERVED_PORT_LIMIT = 1024;

/**
 * Validates a single port value.
 */
export function validatePort(port) {
    const errors = [];

    if (!Number.isInteger(port)) {
        errors.push(`Port must be an integer, got ${typeof port}`);
    } else if (port < MIN_PORT || port > MAX_PORT) {
        errors.push(
            `Port must be between ${MIN_PORT}-${MAX_PORT}, got ${port}`,
        );
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Warns if port is in reserved range (< 1024).
 */
export function checkReservedPort(port) {
    if (port < RESERVED_PORT_LIMIT) {
        return `Port ${port} is reserved (< 1024). May require root/sudo.`;
    }
    return null;
}

/**
 * Validates the entire port registry for conflicts.
 */
export function validateRegistry(customRegistry = registry) {
    const seen = new Map();
    const errors = [];

    for (const [name, { port }] of Object.entries(customRegistry)) {
        const validation = validatePort(port);
        if (!validation.valid) {
            errors.push(`${name}: ${validation.errors.join(', ')}`);
        }

        if (seen.has(port)) {
            errors.push(
                `Port ${port} is used by both '${seen.get(port)}' and '${name}'`,
            );
        }
        seen.set(port, name);

        const reserved = checkReservedPort(port);
        if (reserved) {
            console.warn(`Warning: ${reserved}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Checks if ports are actually available on the system.
 * Only works on Node.js with net module.
 */
export async function checkPortAvailability(customRegistry = registry) {
    const { createServer } = await import('net');
    const unavailable = [];

    for (const [name, { port }] of Object.entries(customRegistry)) {
        await new Promise((resolve) => {
            const server = createServer();

            server.once('error', (/** @type {NodeJS.ErrnoException} */ err) => {
                if (err.code === 'EADDRINUSE') {
                    unavailable.push({
                        service: name,
                        port,
                        reason: 'Port already in use',
                    });
                } else {
                    unavailable.push({
                        service: name,
                        port,
                        reason: err.message,
                    });
                }
                resolve(undefined);
            });

            server.once('listening', () => {
                server.close();
                resolve(undefined);
            });

            server.listen(port, '127.0.0.1');
        });
    }

    return {
        available: unavailable.length === 0,
        unavailable,
    };
}
