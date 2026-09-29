import os from 'node:os';

import { $, chalk, echo, fs, path } from 'zx';

import { failSudoSetup, proxyArgsFor, run, withLock } from './utils.js';

/** Lock directory used to serialise proxy start/restart across concurrent sessions. */
const PROXY_LOCK_DIR = path.join(os.tmpdir(), 'portless-proxy.lock');
/** Records the mode and lanIp the proxy was last started with, to detect config drift. */
export const PROXY_STATE_FILE = path.join(
    os.tmpdir(),
    'portless-scripts-proxy-state.json',
);
/** Lock directory used to serialise socat bridge startup. */
const SOCAT_LOCK_DIR = path.join(os.tmpdir(), 'portless-socat.lock');
/** PID of the running socat bridge, persisted so a later session can reuse it. */
export const SOCAT_STATE_FILE = path.join(
    os.tmpdir(),
    'portless-socat-state.json',
);

/**
 * Verifies pnpm is installed and portless is globally available.
 * If portless is missing, installs it via `pnpm add -g portless` and
 * re-checks that it's on PATH before continuing.
 */
export async function ensurePortless() {
    // Deliberately left un-quieted (unlike everything else below): these are
    // the first commands run, and their output is the most useful diagnostic
    // if pnpm/portless resolution is broken.
    if ((await $({ nothrow: true })`pnpm --version`).exitCode !== 0) {
        echo(
            chalk.red(
                'Error: pnpm is not installed. Install it first: https://pnpm.io/installation',
            ),
        );
        process.exit(1);
    }
    if ((await $({ nothrow: true })`portless --version`).exitCode === 0) return;

    echo(chalk.blue('portless not found globally — installing via pnpm...'));
    const install = await $({
        nothrow: true,
        stdio: 'inherit',
    })`pnpm add -g portless`;
    if (install.exitCode !== 0) {
        echo(
            chalk.red('Failed to install portless via pnpm. See output above.'),
        );
        process.exit(1);
    }

    if ((await $({ nothrow: true })`portless --version`).exitCode !== 0) {
        echo(
            chalk.yellow(
                "portless installed but isn't on your PATH yet.\n" +
                    "This usually means pnpm's global bin directory isn't in PATH.\n" +
                    'Run `pnpm setup`, restart your shell, then re-run this command.',
            ),
        );
        process.exit(1);
    }
}

/**
 * Ensures a socat TCP bridge is running on the LAN IP, forwarding traffic
 * to 127.0.0.1:80 so remote devices can reach the local proxy.
 * Reuses an existing bridge if one is already alive (checked via /proc).
 * Requires passwordless sudo for `/usr/bin/socat`.
 * @returns {Promise<number|null>} The socat child PID, or null if startup failed.
 */
export async function ensureSocat(lanIp) {
    const sudoOut = await run`sudo -n -l`;
    const sudoList = sudoOut.stdout.trim();
    if (!sudoList.includes('/usr/bin/socat')) {
        failSudoSetup(
            'socat needs passwordless sudo to bridge LAN traffic to port 80.',
            'echo "$USER ALL=(ALL) NOPASSWD: /usr/bin/socat" | sudo tee /etc/sudoers.d/portless-socat',
        );
    }

    let socatPid = null;
    await withLock(SOCAT_LOCK_DIR, async () => {
        const state = await fs.readJson(SOCAT_STATE_FILE).catch(() => null);
        if (state?.pid && fs.existsSync(`/proc/${state.pid}`)) {
            socatPid = state.pid;
            return;
        }

        // socat is started and intentionally NOT awaited — it's a long-lived
        // bridge process meant to keep running after this function (and even
        // this script) exits, as long as some other session still needs it.
        // The `.catch()` just stops it from logging an unhandled rejection
        // when nothrow's own error object eventually settles.
        const proc = run`sudo socat TCP-LISTEN:80,bind=${lanIp},fork,reuseaddr TCP:127.0.0.1:80`;
        proc.catch(() => {});
        await new Promise((r) => setTimeout(r, 300));
        socatPid = proc.child?.pid ?? null;
        if (socatPid)
            await fs
                .writeJson(SOCAT_STATE_FILE, { pid: socatPid })
                .catch(() => {});
    });

    return socatPid;
}

/**
 * Resolves the portless and node binary paths, validates passwordless sudo,
 * and starts (or restarts) the shared portless proxy if its configuration
 * has drifted from what this session needs.
 * @returns {Promise<{ nodeBin: string|null, portlessCli: string|null }>}
 */
export async function ensureProxy(mode, lanIp) {
    const [portlessOut, nodeOut] = await Promise.all([
        run`which portless`,
        run`which node`,
    ]);
    const portlessBin = portlessOut.stdout.trim();
    const nodeBin = nodeOut.stdout.trim();

    if (!portlessBin) return { nodeBin: null, portlessCli: null };

    // `which portless` resolves pnpm's shim, not the real CLI file, but sudo
    // needs a concrete `node <file>` target. cmd-shim embeds that path as a
    // comment in the shim, so extract it here.
    const shimOut =
        await run`grep "cmd-shim-target=" ${portlessBin} | cut -d'=' -f2`;
    const shimTarget = shimOut.stdout.trim();
    const portlessCli = shimTarget || portlessBin;

    const sudoOk = await run`sudo -n ${nodeBin} ${portlessCli} --version`;
    if (sudoOk.exitCode !== 0) {
        failSudoSetup(
            'Portless proxy needs passwordless sudo to manage port 80/443 without hanging.',
            `echo "$USER ALL=(ALL) NOPASSWD: ${nodeBin} ${portlessCli} *" | sudo tee /etc/sudoers.d/portless`,
            [
                'If you set this up before and it stopped working, your Node or portless version likely changed:',
                `  node path resolved to:       ${nodeBin}`,
                `  portless script resolved to: ${portlessCli}`,
            ],
        );
    }

    const desired = { mode, lanIp: mode === 'sslip' ? lanIp : null };
    const expectedTld = mode === 'sslip' ? `${lanIp}.sslip.io` : 'local';

    await withLock(PROXY_LOCK_DIR, async () => {
        // Read state inside the lock so we see what the previous session just did.
        const prev = await fs.readJson(PROXY_STATE_FILE).catch(() => null);
        const actualTlds = await fs
            .readFile(
                path.join(os.homedir(), '.portless', 'proxy.tlds'),
                'utf8',
            )
            .then((s) => s.trim())
            .catch(() => null);
        const modeChanged =
            !prev ||
            prev.mode !== desired.mode ||
            prev.lanIp !== desired.lanIp ||
            actualTlds !== expectedTld;

        if (!modeChanged) return; // someone already started it correctly

        await run`sudo ${nodeBin} ${portlessCli} proxy stop`;
        await new Promise((r) => setTimeout(r, 500));

        const proxyArgs = proxyArgsFor(mode, lanIp);
        const maxAttempts = 3;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const result =
                await run`sudo ${nodeBin} ${portlessCli} ${proxyArgs}`;
            if (result.exitCode === 0) break;

            if (attempt === maxAttempts - 1) {
                echo(chalk.red(result.stdout + result.stderr));
                process.exit(result.exitCode ?? 1);
            }
            await run`sudo ${nodeBin} ${portlessCli} proxy stop`;
            await new Promise((r) => setTimeout(r, 500));
        }

        // Write state before releasing the lock.
        await fs.writeJson(PROXY_STATE_FILE, desired).catch(() => {});
    });

    return { nodeBin, portlessCli };
}
