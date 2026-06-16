/**
 * Port registry for all services in the monorepo.
 */
export const registry = {
    web: { port: 4001, description: 'Next.js frontend' },
    server: { port: 4000, description: 'Hono API backend' },
    postgres: { port: 5432, description: 'PostgreSQL Database' },
    redis: { port: 6379, description: 'Redis Session Cache' },
    telemetry: { port: 3000, description: 'Grafana UI' },
};

/**
 * Map of environment variable names to default ports.
 */
export const ENV_MAP = Object.fromEntries(
    Object.entries(registry).map(([k, v]) => [
        `${k.toUpperCase()}_PORT`,
        v.port,
    ]),
);

/**
 * Get all service names.
 */
export function getServiceNames() {
    return Object.keys(registry);
}

/**
 * Check if a service exists in registry.
 */
export function isValidService(name) {
    return name in registry;
}
