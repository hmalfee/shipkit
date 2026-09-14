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

/**
 * Parses `--sslip`, `--name <value>`, `--persist` (order-independent, must
 * precede the command), plus `ENABLE_SSLIP` env fallback.
 * @returns {{mode:'sslip'|'local', name:string|null, persist:boolean, command:string[]}}
 */
export function parseMode(rawArgs) {
    let args = [...rawArgs];
    let sslipFlagged = false;
    let name = null;
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
            name = args[1] ?? null;
            args = args.slice(2);
        }
    }

    const mode =
        sslipFlagged || process.env.ENABLE_SSLIP === '1' ? 'sslip' : 'local';
    return { mode, name, persist, command: args };
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
