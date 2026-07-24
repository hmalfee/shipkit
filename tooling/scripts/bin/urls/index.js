#!/usr/bin/env node
import net from 'net';

import { $, chalk, echo, fs, os, path } from 'zx';

const DEFAULT_BASE = 'http://localhost';

const getLocalIp = () =>
    Object.values(os.networkInterfaces())
        .flat()
        .find((i) => i?.family === 'IPv4' && !i.internal)?.address ??
    '127.0.0.1';

const checkPortAvailable = (port) =>
    new Promise((resolve) => {
        const server = net.createServer();
        server
            .once('error', (err) => resolve(err.code !== 'EADDRINUSE'))
            .once('listening', () => server.close(() => resolve(true)))
            .listen(port, '0.0.0.0');
    });

async function loadEnvUrls(rootDir) {
    const envPath = path.join(rootDir, '.env.urls');
    if (!fs.existsSync(envPath)) {
        echo(chalk.red('Error: .env.urls not found at the root of the repo.'));
        process.exit(1);
    }
    const lines = (await fs.readFile(envPath, 'utf-8')).split('\n');
    return Object.fromEntries(
        lines
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('#'))
            .map((l) => l.split('='))
            .map(([key, ...rest]) => [
                key,
                rest.join('=').split('#')[0].trim(),
            ]),
    );
}

async function resolveCurrentAppPort(ports) {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const appName = fs.existsSync(pkgPath)
        ? (await fs.readJson(pkgPath)).name
        : null;
    if (!appName || appName === 'shipkit') return null;

    const prefix = appName.split('/').pop().toUpperCase().replace(/-/g, '_');
    if (!ports[prefix]) {
        echo(
            chalk.red(
                `Error: Port for app '${appName}' (${prefix}_PORT) not found in .env.urls`,
            ),
        );
        process.exit(1);
    }

    const port = parseInt(ports[prefix], 10);
    if (port && !(await checkPortAvailable(port))) {
        echo(
            chalk.red(
                `\n  Error: Port ${port} for app '${appName}' is already in use.\n  Free it or change it in .env.urls.\n`,
            ),
        );
        process.exit(1);
    }
    return ports[prefix];
}

async function main() {
    const args = process.argv.slice(2);
    const rootDir = (await $`git rev-parse --show-toplevel`).stdout.trim();

    const env = await loadEnvUrls(rootDir);

    const resolveBase = (val) =>
        (val ?? DEFAULT_BASE).replace('{IP}', getLocalIp());
    const internalBase = resolveBase(env.INTERNAL_BASE);
    const publicBase = resolveBase(env.PUBLIC_BASE);

    const ports = Object.fromEntries(
        Object.entries(env)
            .filter(([key]) => key.endsWith('_PORT'))
            .map(([key, val]) => [key.replace('_PORT', ''), val]),
    );

    const useNextjs = ['js', 'ts', 'mjs'].some((ext) =>
        fs.existsSync(path.join(process.cwd(), `next.config.${ext}`)),
    );

    for (const [prefix, port] of Object.entries(ports)) {
        process.env[`INTERNAL_${prefix}_URL`] = `${internalBase}:${port}`;
        process.env[`${prefix}_URL`] = `${publicBase}:${port}`;
        if (useNextjs) {
            process.env[`NEXT_PUBLIC_${prefix}_URL`] = `${publicBase}:${port}`;
        }
    }

    const currentPort = await resolveCurrentAppPort(ports);
    if (currentPort) process.env.PORT = currentPort;

    if (!args.length) {
        return echo(
            chalk.blue('Environment variables injected. No command provided.'),
        );
    }
    try {
        await $({ stdio: 'inherit' })`${args}`;
    } catch (p) {
        process.exit(p.exitCode || 1);
    }
}

main();
