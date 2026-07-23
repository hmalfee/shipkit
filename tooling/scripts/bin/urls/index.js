#!/usr/bin/env node
import net from 'net';

import { $, chalk, echo, fs, os, path } from 'zx';

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

async function loadPorts(rootDir) {
    const envPortsPath = path.join(rootDir, '.env.ports');
    if (!fs.existsSync(envPortsPath)) {
        echo(chalk.red('Error: .env.ports not found at the root of the repo.'));
        process.exit(1);
    }
    const lines = (await fs.readFile(envPortsPath, 'utf-8')).split('\n');
    return Object.fromEntries(
        lines
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('#'))
            .map((l) => l.split('='))
            .filter(([key]) => key.endsWith('_PORT'))
            .map(([key, ...rest]) => [
                key.replace('_PORT', ''),
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
                `Error: Port for app '${appName}' (${prefix}_PORT) not found in .env.ports`,
            ),
        );
        process.exit(1);
    }

    const port = parseInt(ports[prefix], 10);
    if (port && !(await checkPortAvailable(port))) {
        echo(
            chalk.red(
                `\n❌ Error: Port ${port} for app '${appName}' is already in use. Please free up the port or change it in .env.ports before starting.\n`,
            ),
        );
        process.exit(1);
    }
    return ports[prefix];
}

async function main() {
    const rawArgs = process.argv.slice(2);
    const isNetwork = rawArgs.includes('--network');
    const args = rawArgs.filter((arg) => arg !== '--network');

    const rootDir = (await $`git rev-parse --show-toplevel`).stdout.trim();
    const ports = await loadPorts(rootDir);

    const useNextjs = ['js', 'ts', 'mjs'].some((ext) =>
        fs.existsSync(path.join(process.cwd(), `next.config.${ext}`)),
    );
    const hostname = isNetwork ? getLocalIp() : 'localhost';

    for (const [prefix, port] of Object.entries(ports)) {
        const url = `http://${hostname}:${port}`;
        process.env[`${prefix}_URL`] = url;
        if (useNextjs) process.env[`NEXT_PUBLIC_${prefix}_URL`] = url;
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
