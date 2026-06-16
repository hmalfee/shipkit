#!/usr/bin/env node
import { $, argv, chalk, echo, spinner, which } from 'zx';

import { getServiceNames, isValidService, registry } from './registry.js';
import { buildEnvWithPorts, getPort, resolvePortsFromEnv } from './resolve.js';
import { checkPortAvailability, validateRegistry } from './validate.js';

$.verbose = false;
const [command, ...args] = argv._;

function abortIfInvalid() {
    const { valid, errors } = validateRegistry();

    if (!valid) {
        echo(chalk.red('Port registry validation failed:'));
        errors.forEach((err) => echo(chalk.red(`  ${err}`)));
        process.exit(1);
    }
}

async function readPackageName() {
    const pkgPath = `${process.cwd()}/package.json`;

    if ((await $`test -f ${pkgPath}`.nothrow()).exitCode !== 0) return null;

    try {
        return (
            JSON.parse((await $`cat ${pkgPath}`.quiet()).stdout).name ?? null
        );
    } catch {
        return null;
    }
}

const commands = {
    get() {
        const [serviceName] = args;

        if (!serviceName || !isValidService(serviceName)) {
            echo(
                chalk.red(
                    `Unknown service: '${serviceName}'. Known: ${getServiceNames().join(', ')}`,
                ),
            );
            process.exit(1);
        }

        try {
            process.stdout.write(String(getPort(serviceName)));
        } catch (err) {
            echo(chalk.red(err instanceof Error ? err.message : String(err)));
            process.exit(1);
        }
    },

    async exec() {
        abortIfInvalid();

        if (!args.length) {
            echo(chalk.red('Usage: ports exec <command> [args...]'));
            process.exit(1);
        }

        const [bin, ...binArgs] = args;

        try {
            await which(bin);
        } catch {
            echo(chalk.red(`Command not found: '${bin}'`));
            process.exit(1);
        }

        const env = buildEnvWithPorts(process.env);
        const pkgName = await readPackageName();

        if (pkgName) {
            const serviceName = pkgName.split('/').pop();
            const portVar = `${serviceName.toUpperCase()}_PORT`;
            if (registry[serviceName] && env[portVar])
                env.PORT = env[portVar].toString();
        }

        const resolvedArgs = binArgs.map((arg) =>
            arg.replace(
                /(?:\$([a-zA-Z0-9_]+)|\$\{([a-zA-Z0-9_]+)\}|%([a-zA-Z0-9_]+)%)/g,
                (match, p1, p2, p3) => env[p1 ?? p2 ?? p3] ?? match,
            ),
        );
        const { exitCode } = await $({
            env,
            stdio: 'inherit',
        })`${bin} ${resolvedArgs}`.nothrow();

        process.exit(exitCode ?? 0);
    },

    async check() {
        abortIfInvalid();

        if (!argv.live) {
            echo(chalk.green('✓ No port conflicts found.'));
            return;
        }

        try {
            const result = await spinner(
                'Checking port availability…',
                checkPortAvailability,
            );
            if (result.available) {
                echo(chalk.green('✓ All ports are available.'));
            } else {
                echo(chalk.red('✗ Some ports are unavailable:'));
                result.unavailable.forEach(({ service, port, reason }) =>
                    echo(chalk.red(`  ${service}:${port} — ${reason}`)),
                );
                process.exit(1);
            }
        } catch (err) {
            echo(
                chalk.red(
                    `Port availability check failed: ${err instanceof Error ? err.message : String(err)}`,
                ),
            );
            process.exit(1);
        }
    },

    async list() {
        const entries = Object.entries(registry);

        if (argv.json) {
            process.stdout.write(
                JSON.stringify(
                    entries.map(([name, { port, description }]) => ({
                        Service: name,
                        Port: port,
                        'Env Var': `${name.toUpperCase()}_PORT`,
                        Description: description,
                    })),
                    null,
                    2,
                ) + '\n',
            );
            return;
        }

        const rows = [
            'SERVICE\tPORT\tENV VAR\tDESCRIPTION',
            ...entries.map(
                ([name, { port, description }]) =>
                    `${name}\t${port}\t${name.toUpperCase()}_PORT\t${description}`,
            ),
        ].join('\n');

        await $({
            input: rows,
            stdio: ['pipe', 'inherit', 'inherit'],
        })`column -t -s ${'\t'}`;
    },

    'gen-env'() {
        abortIfInvalid();

        const fmt = argv.format ?? 'dotenv';
        const resolved = Object.entries(resolvePortsFromEnv(process.env));
        const output =
            fmt === 'json'
                ? JSON.stringify(Object.fromEntries(resolved), null, 2) + '\n'
                : resolved
                      .map(([k, v]) =>
                          fmt === 'shell' ? `export ${k}=${v}` : `${k}=${v}`,
                      )
                      .join('\n') + '\n';

        process.stdout.write(output);
    },

    async compose() {
        abortIfInvalid();

        const { exitCode } = await $({
            env: buildEnvWithPorts(process.env),
            stdio: 'inherit',
        })`docker compose ${args}`.nothrow();

        process.exit(exitCode ?? 0);
    },

    help() {
        const topic = args[0];
        const help = {
            default: `Ports CLI — Manage service ports in mento-mark monorepo
Usage: ports <command> [options]
Commands:
  get <service>              Get port for a service
  exec <cmd> [args...]       Execute command with port env vars injected
  compose [args...]          Run docker compose with port env vars injected
  list [--json]              List all services and ports
  check [--live]             Validate port registry (--live checks availability)
  gen-env [--format=fmt]     Generate .env file (dotenv|shell|json)
  help [command]             Show this help or help for specific command
Examples:
  ports get web
  ports exec npm run dev
  ports compose up -d
  WEB_PORT=5000 ports exec next dev`,
            get: `Get port for a service
Usage: ports get <service>
Examples:
  ports get web           # Output: 4001
  ports get postgres      # Output: 5432`,
            exec: `Execute command with port env vars injected
Usage: ports exec <command> [args...]
PORT is auto-set when run inside a package matching a registry service.
Override with: <SERVICE>_PORT=<port> ports exec <cmd>
Examples:
  ports exec npm run dev
  WEB_PORT=5000 ports exec next dev`,
            compose: `Wrapper for docker compose with automatic port env injection
Usage: ports compose [args...]
Examples:
  ports compose up -d
  ports compose down
  ports compose logs -f service_name`,
            check: `Validate port registry
Usage: ports check [--live]
  --live    Also check system port availability
Examples:
  ports check
  ports check --live`,
        };

        echo(help[topic] ?? help.default);
    },
};

const handler = commands[command];

if (!handler) {
    echo(
        command
            ? chalk.red(
                  `Unknown command: '${command}'. Available: ${Object.keys(commands).join(', ')}\nUse "ports help" for usage.`,
              )
            : chalk.white('No command provided. Use "ports help" for usage.'),
    );

    process.exit(1);
}

await handler();
