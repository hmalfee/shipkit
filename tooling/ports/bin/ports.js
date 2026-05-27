#!/usr/bin/env node
// oxlint-disable eslint-js/no-restricted-syntax
// oxlint-disable no-console
import { spawnSync } from 'child_process';

import { getServiceNames, isValidService, registry } from '../src/registry.js';
import {
    buildEnvWithPorts,
    getPort,
    resolvePortsFromEnv,
} from '../src/resolve.js';
import { checkPortAvailability, validateRegistry } from '../src/validate.js';

const [, , command, ...args] = process.argv;

const commands = {
    /**
     * Get port for a specific service: ports get <service>
     */
    get() {
        const serviceName = args[0];
        if (!serviceName || !isValidService(serviceName)) {
            console.error(
                `Unknown service: '${serviceName}'. Known: ${getServiceNames().join(', ')}`,
            );
            process.exit(1);
        }

        try {
            const port = getPort(serviceName);
            process.stdout.write(String(port));
        } catch (err) {
            console.error(err.message);
            process.exit(1);
        }
    },

    /**
     * Execute command with port env vars injected: ports exec -- <cmd> [args...]
     */
    exec() {
        const validation = validateRegistry();
        if (!validation.valid) {
            console.error('Port registry validation failed:');
            validation.errors.forEach((err) => console.error(`  ${err}`));
            process.exit(1);
        }

        const dashIdx = args.indexOf('--');
        const cmdArgs = dashIdx === -1 ? args : args.slice(dashIdx + 1);

        if (!cmdArgs.length) {
            console.error('Usage: ports exec -- <command> [args...]');
            process.exit(1);
        }

        const [bin, ...binArgs] = cmdArgs;
        const env = buildEnvWithPorts(process.env);

        const replacedBinArgs = binArgs.map((arg) => {
            return arg.replace(
                /(?:\$([a-zA-Z0-9_]+)|\$\{([a-zA-Z0-9_]+)\}|%([a-zA-Z0-9_]+)%)/g,
                (match, p1, p2, p3) => {
                    const varName = p1 || p2 || p3;
                    return env[varName] !== undefined ? env[varName] : match;
                },
            );
        });

        const result = spawnSync(bin, replacedBinArgs, {
            stdio: 'inherit',
            env,
        });

        process.exit(result.status ?? 1);
    },

    /**
     * Validate port registry: ports check [--live]
     */
    check() {
        const live = args.includes('--live');

        const validation = validateRegistry();
        if (!validation.valid) {
            console.error('Port registry validation failed:');
            validation.errors.forEach((err) => console.error(`  ${err}`));
            process.exit(1);
        }

        if (live) {
            checkPortAvailability()
                .then((result) => {
                    if (result.available) {
                        console.log('✓ All ports are available.');
                    } else {
                        console.error('✗ Some ports are unavailable:');
                        result.unavailable.forEach(
                            ({ service, port, reason }) => {
                                console.error(
                                    `  ${service}:${port} — ${reason}`,
                                );
                            },
                        );
                        process.exit(1);
                    }
                })
                .catch((err) => {
                    console.error(
                        'Port availability check failed:',
                        err.message,
                    );
                    process.exit(1);
                });
        } else {
            console.log('✓ No port conflicts found.');
        }
    },

    /**
     * List all services and ports: ports list [--json]
     */
    list() {
        const json = args.includes('--json');

        const data = Object.entries(registry).map(
            ([name, { port, description }]) => ({
                Service: name,
                Port: port,
                'Env Var': `${name.toUpperCase()}_PORT`,
                Description: description,
            }),
        );

        if (json) {
            process.stdout.write(JSON.stringify(data, null, 2) + '\n');
        } else {
            console.table(data);
        }
    },

    /**
     * Generate .env file content: ports gen-env [--format=dotenv|json|shell]
     */
    'gen-env'() {
        const validation = validateRegistry();
        if (!validation.valid) {
            console.error('Port registry validation failed:');
            validation.errors.forEach((err) => console.error(`  ${err}`));
            process.exit(1);
        }

        const format =
            args.find((a) => a.startsWith('--format='))?.split('=')[1] ??
            'dotenv';
        const resolved = resolvePortsFromEnv(process.env);

        let output = '';

        if (format === 'json') {
            output = JSON.stringify(resolved, null, 2) + '\n';
        } else if (format === 'shell') {
            output =
                Object.entries(resolved)
                    .map(([k, v]) => `export ${k}=${v}`)
                    .join('\n') + '\n';
        } else {
            // dotenv format (default)
            output =
                Object.entries(resolved)
                    .map(([k, v]) => `${k}=${v}`)
                    .join('\n') + '\n';
        }

        process.stdout.write(output);
    },

    /**
     * Wrapper for docker compose: ports compose [args...]
     * Automatically injects port env vars into docker compose commands.
     *
     * Usage:
     *   ports compose up -d
     *   ports compose down
     *   ports compose logs -f
     */
    compose() {
        const validation = validateRegistry();
        if (!validation.valid) {
            console.error('Port registry validation failed:');
            validation.errors.forEach((err) => console.error(`  ${err}`));
            process.exit(1);
        }

        const env = buildEnvWithPorts(process.env);

        const result = spawnSync('docker', ['compose', ...args], {
            stdio: 'inherit',
            env,
        });

        process.exit(result.status ?? 1);
    },

    /**
     * Show help: ports help [command]
     */
    help() {
        const topic = args[0];

        const helpText = {
            default: `Ports CLI — Manage service ports in mento-mark monorepo

Usage: ports <command> [options]

Commands:
  get <service>              Get port for a service
  exec -- <cmd> [args...]    Execute command with port env vars injected
  compose [args...]          Run docker compose with port env vars injected
  list [--json]              List all services and ports
  check [--live]             Validate port registry (--live checks availability)
  gen-env [--format=fmt]     Generate .env file (dotenv|shell|json)
  help [command]             Show this help or help for specific command

Examples:
  ports get web
  ports exec -- npm run dev
  ports compose up -d
  WEB_PORT=5000 ports exec -- next dev
`,
            get: `Get port for a service

Usage: ports get <service>

Examples:
  ports get web           # Output: 4001
  ports get postgres      # Output: 5432
`,
            exec: `Execute command with port env vars injected

Usage: ports exec -- <command> [args...]

Port env vars are automatically set based on the registry.
You can override them with environment variables:
  <SERVICE>_PORT=<port> ports exec -- <cmd>

Examples:
  ports exec -- npm run dev
  WEB_PORT=5000 ports exec -- next dev
  ports exec -- docker compose up
`,
            compose: `Wrapper for docker compose with automatic port env injection

Usage: ports compose [args...]

All docker compose arguments are passed through. Port env vars are
automatically injected, so docker-compose.yml can reference them.

Examples:
  ports compose up -d
  ports compose down
  ports compose logs -f service_name
`,
            check: `Validate port registry

Usage: ports check [--live]

Options:
  --live    Check if ports are actually available on the system

Examples:
  ports check          # Check for registry conflicts only
  ports check --live   # Check registry + system availability
`,
        };

        const text = helpText[topic] ?? helpText.default;
        console.log(text);
    },
};

/**
 * Route to handler or show error
 */
const handler = commands[command];

if (!handler) {
    if (!command) {
        console.error('No command provided. Use "ports help" for usage.');
    } else {
        console.error(
            `Unknown command: '${command}'. Available: ${Object.keys(commands).join(', ')}`,
        );
        console.error('Use "ports help" for usage.');
    }
    process.exit(1);
}

handler();
