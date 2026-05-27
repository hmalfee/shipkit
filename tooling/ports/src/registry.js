/**
 * @typedef {object} ServiceConfig
 * @property {number} port
 * @property {string} description
 */

// @ts-check
/**
 * Port registry for all services in the monorepo.
 * @type {Record<string, ServiceConfig>}
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
 * @type {Record<string, number>}
 */
export const ENV_MAP = Object.fromEntries(
    Object.entries(registry).map(([k, v]) => [
        `${k.toUpperCase()}_PORT`,
        v.port,
    ]),
);

/**
 * Get all service names.
 * @returns {string[]}
 */
export function getServiceNames() {
    return Object.keys(registry);
}

/**
 * Check if a service exists in registry.
 * @param {string} name
 * @returns {boolean}
 */
export function isValidService(name) {
    return name in registry;
}
