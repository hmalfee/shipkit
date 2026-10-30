import net from 'node:net';
import os from 'node:os';

import { $, chalk, echo, fs } from 'zx';

/** Shell helper: runs quietly, never throws — callers check exitCode. */
export function run(strings, ...vals) {
    return $({ nothrow: true })(strings, ...vals).quiet();
}

/** Sync twin of {@link run}, for `process.on('exit')` handlers (no await there). */
export function runSync(strings, ...vals) {
    return $.sync({ stdio: 'ignore', nothrow: true })(strings, ...vals);
}

/**
 * Prints sudo setup instructions and exits(1). Shared by ensureSocat/ensureProxy
 * in portless.js — same layout, different warning/command/context lines.
 */
export function failSudoSetup(warning, sudoersCmd, contextLines = []) {
    echo(chalk.yellow(warning));
    for (const line of contextLines) echo(chalk.white(line));
    echo(
        chalk.white(
            `${contextLines.length ? '\n' : ''}Run this once, then re-run your command:\n`,
        ),
    );
    echo(chalk.cyan(`  ${sudoersCmd}`));
    echo('');
    process.exit(1);
}

/**
 * Runs `fn` under a `mkdir`-based lock at `lockDir` (atomic on local FS).
 * A pid file lets a waiter detect a crashed holder and steal the lock.
 * Gives up after 15s and runs `fn` unlocked.
 */
export async function withLock(lockDir, fn) {
    const pidFile = lockDir + '.pid';
    const deadline = Date.now() + 15_000;
    while (true) {
        try {
            await fs.mkdir(lockDir);
            await fs.writeFile(pidFile, String(process.pid)).catch(() => {});
            break;
        } catch (err) {
            if (err.code !== 'EEXIST') throw err;
            // Stale lock: pid file missing/unreadable, or owner no longer alive.
            const ownerPid = parseInt(
                await fs.readFile(pidFile, 'utf8').catch(() => ''),
                10,
            );
            if (isNaN(ownerPid) || !fs.existsSync(`/proc/${ownerPid}`)) {
                await fs.remove(lockDir).catch(() => {});
                await fs.remove(pidFile).catch(() => {});
                continue;
            }
            if (Date.now() > deadline) {
                echo(
                    chalk.yellow(
                        `Timed out waiting for another process to release the lock at ${lockDir} — continuing anyway.`,
                    ),
                );
                break;
            }
            await new Promise((r) => setTimeout(r, 200));
        }
    }
    try {
        await fn();
    } finally {
        await fs.remove(lockDir).catch(() => {});
        await fs.remove(pidFile).catch(() => {});
    }
}

/** Returns the first non-loopback IPv4 address, or null if none is found. */
export function getLanIp() {
    for (const ifaces of Object.values(os.networkInterfaces())) {
        for (const iface of ifaces ?? []) {
            if (iface.family === 'IPv4' && !iface.internal)
                return iface.address;
        }
    }
    return null;
}

/** `my-app` → `MY_APP`. Used for every injected env var prefix. */
export const toEnvKey = (name) => name.toUpperCase().replace(/-/g, '_');

/** POSIX single-quote escaping for building `sh -c` strings. */
export const shellQuote = (arg) => `'${String(arg).replace(/'/g, `'\\''`)}'`;

// Lowercase hostname label that is also a valid env-var prefix once
// upper-cased: starts with a letter, no leading/trailing hyphen.
const MULTI_NAME_RE = /^[a-z]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Rejects duplicate names always, and (only when several names are given,
 * where each becomes an env var prefix) names that aren't hostname/env safe.
 * A lone `--name` keeps its previous permissive behaviour (e.g. `api.myapp`).
 */
export function validateNames(names) {
    const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    if (dupes.length) {
        echo(chalk.red(`Duplicate --name value(s): ${dupes.join(', ')}`));
        process.exit(1);
    }
    if (names.length > 1) {
        const bad = names.filter((n) => !MULTI_NAME_RE.test(n));
        if (bad.length) {
            echo(
                chalk.red(
                    `Invalid --name value(s): ${bad.join(', ')}\n` +
                        'With multiple names, each must be lowercase letters, digits and hyphens, ' +
                        'start with a letter, and not end with a hyphen.',
                ),
            );
            process.exit(1);
        }
    }
}

/**
 * Reserves `count` distinct free ports. All sockets stay open until every
 * port is chosen so the OS can't hand out the same one twice. There is still
 * a small window between closing and the app binding; unavoidable without
 * handing the socket over.
 * @returns {Promise<number[]>}
 */
export async function allocatePorts(count) {
    const servers = [];
    try {
        const ports = [];
        for (let i = 0; i < count; i++) {
            const srv = net.createServer();
            servers.push(srv);
            await new Promise((resolve, reject) => {
                srv.once('error', reject);
                srv.listen(0, resolve);
            });
            ports.push(
                /** @type {import('node:net').AddressInfo} */ (srv.address())
                    .port,
            );
        }
        return ports;
    } finally {
        await Promise.all(
            servers.map((s) => new Promise((r) => s.close(() => r()))),
        );
    }
}

/**
 * Parses `--sslip`, `--name <value>` (repeatable), `--persist`
 * (order-independent, must precede the command), plus `ENABLE_SSLIP` env fallback.
 *
 * Note on ports: with zero or one `--name`, the command runs under
 * `portless run` and receives a single `PORT`. With two or more, it runs
 * directly and receives one `<NAME>_PORT` per name and no `PORT`. Going from
 * two names back to one therefore breaks anything reading `<NAME>_PORT`.
 *
 * @returns {{mode:'sslip'|'local', names:string[], persist:boolean, command:string[]}}
 */
export function parseMode(rawArgs) {
    let args = [...rawArgs];
    let sslipFlagged = false;
    const names = [];
    let persist = false;

    while (
        args[0] === '--sslip' ||
        args[0] === '--name' ||
        args[0] === '--persist'
    ) {
        if (args[0] === '--sslip') {
            sslipFlagged = true;
            args = args.slice(1);
        } else if (args[0] === '--persist') {
            persist = true;
            args = args.slice(1);
        } else {
            if (!args[1] || args[1].startsWith('--')) {
                echo(chalk.red('--name requires a value.'));
                process.exit(1);
            }
            names.push(args[1]);
            args = args.slice(2);
        }
    }

    const mode =
        sslipFlagged || process.env.ENABLE_SSLIP === '1' ? 'sslip' : 'local';
    return { mode, names, persist, command: args };
}

/**
 * Builds the `portless proxy start` argument list for the given mode.
 * In sslip mode the TLD is `<lanIp>.sslip.io`; in local mode it is `.local`.
 * Both disable TLS and listen on port 80.
 */
export function proxyArgsFor(mode, lanIp) {
    return mode === 'sslip'
        ? [
              'proxy',
              'start',
              '--tld',
              `${lanIp}.sslip.io`,
              '--no-tls',
              '-p',
              '80',
          ]
        : ['proxy', 'start', '--lan', '--no-tls', '-p', '80'];
}
