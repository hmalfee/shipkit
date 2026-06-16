import { ENV_MAP, registry } from './registry.js';
import { validatePort } from './validate.js';

/**
 * Resolves port configuration by merging registry defaults with env overrides.
 * Env vars take precedence over registry defaults.
 */
export function resolvePortsFromEnv(env = process.env) {
    const resolved = {};

    for (const [envVar, defaultPort] of Object.entries(ENV_MAP)) {
        const envValue = env[envVar];

        if (envValue !== undefined) {
            const port = Number(envValue);
            const validation = validatePort(port);

            if (!validation.valid) {
                throw new Error(
                    `Invalid port override for ${envVar}: ${validation.errors.join(', ')}`,
                );
            }

            resolved[envVar] = port;
        } else {
            resolved[envVar] = defaultPort;
        }
    }

    return resolved;
}

/**
 * Gets a single port by service name, considering env overrides.
 */
export function getPort(serviceName, env = process.env) {
    if (!(serviceName in registry)) {
        throw new Error(`Unknown service: '${serviceName}'`);
    }

    const envVar = `${serviceName.toUpperCase()}_PORT`;
    const envValue = env[envVar];

    if (envValue !== undefined) {
        const port = Number(envValue);
        const validation = validatePort(port);

        if (!validation.valid) {
            throw new Error(
                `Invalid port override for ${envVar}: ${validation.errors.join(', ')}`,
            );
        }

        return port;
    }

    return registry[serviceName].port;
}

/**
 * Merges resolved ports into a new environment object.
 * Useful for passing to child processes.
 * @returns {Record<string, string>}
 */
export function buildEnvWithPorts(baseEnv = process.env) {
    const resolved = resolvePortsFromEnv(baseEnv);

    return {
        ...baseEnv,
        ...resolved,
    };
}
