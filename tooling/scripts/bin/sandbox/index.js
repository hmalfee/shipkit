#!/usr/bin/env node
import { parseArgs } from 'node:util';

import { chalk, echo } from 'zx';

import { runAct } from './act.js';
import {
    DEFAULT_DOKPLOY_PORT,
    DEFAULT_REGISTRY_UI_PORT,
    startSandbox,
    stopSandbox,
} from './sandbox.js';

const USAGE = `Usage: pnpm sandbox <command> [options]

Commands:
  start     Start the sandbox (Dokploy server instance + GitHub runner instance)
            Options:
              --dokploy-port <N>       Dokploy web/API port on host (default: 3000)
              --registry-ui-port <N>   Docker registry UI port on host (default: 5001)
              --clean                  Reset Dokploy instance state before start

  stop      Stop the sandbox
            Options:
              --rm                     Remove containers and network (volumes kept)

  run-act   Run a GitHub Actions workflow on the runner instance against Dokploy
            Options:
              [<workflow>]             Workflow name without .yml (omit to choose interactively)
              --ref <branch>           Branch name to simulate (e.g. staging)
              --event <name>           GitHub event (default: workflow_dispatch)
              --use-cache              Fast iteration: skip cold runner reset (not true-to-CI)
              --disable-actions-cache  Don't start the cache server (actions/cache steps become no-ops)
              --env-from <path>        Load extra env vars from file (repeatable)
              --secrets-from <path>    Load extra secrets from file (repeatable)
              --secrets-from-apps-env  Load secrets from apps/*/.env
              --env KEY=VALUE          Set individual env var (repeatable)
              --secret KEY=VALUE       Set individual secret (repeatable)`;

function parseFlags(args, options, { positionals = false } = {}) {
    try {
        return parseArgs({ args, options, allowPositionals: positionals });
    } catch (err) {
        throw new Error(`${err.message}\n${USAGE}`);
    }
}

function parsePort(value, fallback, label) {
    if (!value) return fallback;
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error(`Invalid ${label} "${value}" (expected 1-65535)`);
    return port;
}

const commands = {
    async start(args) {
        const { values } = parseFlags(args, {
            'dokploy-port': { type: 'string' },
            'registry-ui-port': { type: 'string' },
            clean: { type: 'boolean' },
        });
        const dokployPort = parsePort(
            values['dokploy-port'] ?? process.env.DOKPLOY_PORT,
            DEFAULT_DOKPLOY_PORT,
            'Dokploy port',
        );
        const registryUiPort = parsePort(
            values['registry-ui-port'] ?? process.env.REGISTRY_UI_PORT,
            DEFAULT_REGISTRY_UI_PORT,
            'registry UI port',
        );
        if (dokployPort === registryUiPort)
            throw new Error(
                `Dokploy port and registry UI port are both ${dokployPort}; they must differ`,
            );
        await startSandbox({
            port: dokployPort,
            registryUiPort,
            clean: Boolean(values.clean),
        });
    },

    async stop(args) {
        const { values } = parseFlags(args, { rm: { type: 'boolean' } });
        await stopSandbox({ rm: Boolean(values.rm) });
    },

    async 'run-act'(args) {
        const { values, positionals } = parseFlags(
            args,
            {
                ref: { type: 'string' },
                event: { type: 'string' },
                'use-cache': { type: 'boolean' },
                'disable-actions-cache': { type: 'boolean' },
                'env-from': { type: 'string', multiple: true },
                'secrets-from': { type: 'string', multiple: true },
                'secrets-from-apps-env': { type: 'boolean' },
                env: { type: 'string', multiple: true },
                secret: { type: 'string', multiple: true },
            },
            { positionals: true },
        );
        if (positionals.length > 1)
            throw new Error(
                `Unexpected argument "${positionals[1]}"\n${USAGE}`,
            );
        await runAct(positionals[0], {
            ref: values.ref,
            event: values.event,
            useCache: Boolean(values['use-cache']),
            disableActionsCache: Boolean(values['disable-actions-cache']),
            envFiles: values['env-from'] ?? [],
            secretsFiles: values['secrets-from'] ?? [],
            appsEnv: Boolean(values['secrets-from-apps-env']),
            env: values.env ?? [],
            secrets: values.secret ?? [],
        });
    },
};

async function main() {
    const [command, ...args] = process.argv.slice(2);
    if (!command || !Object.hasOwn(commands, command))
        throw new Error(
            `${command ? `Unknown command "${command}"` : 'Missing command'}\n${USAGE}`,
        );
    await commands[command](args);
}

main().catch((err) => {
    echo(chalk.red(err?.message ?? String(err)));
    process.exit(1);
});
