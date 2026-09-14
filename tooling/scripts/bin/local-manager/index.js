#!/usr/bin/env node
import { $, chalk, echo, path } from 'zx';

import { getWorkspaceRoot } from '../../lib/workspace.js';
import { ensurePortless, ensureProxy, ensureSocat } from './portless.js';
import {
    cleanupSession,
    cleanupSessionSync,
    otherActiveSessions,
    registerSession,
} from './sessions.js';
import { getLanIp, parseMode, run } from './utils.js';
import {
    discoverWorkspacePackages,
    injectAppUrls,
    killStaleNextDev,
} from './workspace-urls.js';

/**
 * Entry point. Validates the environment, starts or reuses the shared proxy,
 * injects workspace URLs as environment variables, and then execs the user's
 * command wrapped in `portless run` so it is registered with the proxy.
 * Registers cleanup hooks that fire on both graceful signals and hard exit.
 */
async function main() {
    const {
        mode,
        name: routeNameOverride,
        persist,
        command: rawArgs,
    } = parseMode(process.argv.slice(2));
    const rootDir = await getWorkspaceRoot();

    await ensurePortless();

    const lanIp = getLanIp();
    if (!lanIp) {
        if (mode === 'sslip') {
            echo(
                chalk.red(
                    '--sslip requires a LAN IP and none was detected on this machine.',
                ),
            );
            process.exit(1);
        }
        echo(
            chalk.yellow(
                'No LAN IP detected — .local URLs will only work on this machine.',
            ),
        );
    }

    // Proxy is shared machine-wide — two sessions can't run different modes.
    // Fail loudly rather than silently switching the other session's mode.
    const conflicts = (await otherActiveSessions()).filter(
        (s) => s.mode !== mode,
    );
    if (conflicts.length > 0) {
        echo(
            chalk.red(
                `Another running dev session on this machine is in "${conflicts[0].mode}" mode, ` +
                    `but this one requested "${mode}".\n` +
                    'The proxy is shared machine-wide and can only run one mode at a time.\n' +
                    `Stop the other session(s) first, or match their mode ` +
                    `(${conflicts[0].mode === 'sslip' ? 'pass --sslip' : 'drop --sslip'}).`,
            ),
        );
        process.exit(1);
    }

    const sessionFile = await registerSession(mode);

    const { nodeBin, portlessCli } = await ensureProxy(mode, lanIp);
    const socatPid = mode === 'sslip' ? await ensureSocat(lanIp) : null;
    await run`portless prune`;

    const packages = await discoverWorkspacePackages(rootDir);
    const currentPkg = packages.find(
        (p) => path.resolve(p.dir) === path.resolve(process.cwd()),
    );

    // `--name` overrides the routing name derived from the package dir, so a
    // package running multiple independently-routed processes (e.g. two
    // containers from one `dev` script) doesn't collide under one name.
    const routeName = routeNameOverride || currentPkg?.shortName;

    const shortNames = packages.map((p) => p.shortName);
    injectAppUrls(
        routeName && !shortNames.includes(routeName)
            ? [...shortNames, routeName]
            : shortNames,
        mode,
        lanIp,
    );

    // Skip for overridden routes: likely a docker sub-service, not Next.js —
    // concurrent invocations from the same dir shouldn't race the lock file.
    if (currentPkg && !routeNameOverride)
        await killStaleNextDev(currentPkg.dir);

    process.env.NODE_OPTIONS = [
        process.env.NODE_OPTIONS,
        '--no-network-family-autoselection',
    ]
        .filter(Boolean)
        .join(' ');

    if (!rawArgs.length) {
        if (persist) {
            echo(chalk.yellow('--persist has no effect without a command.'));
        }
        echo(
            chalk.blue('Environment variables injected. No command provided.'),
        );
        return;
    }

    // Wrap in `portless run` only inside a known package (stable route name).
    // `--persist` keeps the route alive after commands that exit quickly by
    // design (e.g. `docker compose up -d`): on success, chain `exec sleep
    // infinity` so the wrapped process stays alive; a failing command still
    // fails immediately.
    const shellQuote = (arg) => `'${String(arg).replace(/'/g, `'\\''`)}'`;
    const command = currentPkg
        ? [
              'portless',
              'run',
              '--force',
              '--name',
              routeName,
              ...(persist
                  ? [
                        'sh',
                        '-c',
                        `${rawArgs.map(shellQuote).join(' ')} && exec sleep infinity`,
                    ]
                  : rawArgs),
          ]
        : rawArgs;

    // ─── Lifecycle / cleanup handlers ───────────────────────────────────────────
    // `cleaned` guards against double teardown: onSignal re-raises its signal
    // after cleanup, which would otherwise also trigger the 'exit' handler.
    let cleaned = false;
    const onSignal = async (sig) => {
        if (cleaned) return;
        cleaned = true;
        await cleanupSession(sessionFile, nodeBin, portlessCli, socatPid);
        process.kill(process.pid, sig);
    };
    // Fallback for exits that skip onSignal (uncaught exception, a bare
    // process.exit()). 'exit' fires synchronously, hence the *Sync helper.
    process.once('exit', () => {
        if (cleaned) return;
        cleaned = true;
        try {
            cleanupSessionSync(sessionFile, nodeBin, portlessCli, socatPid);
        } catch {}
    });
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        process.once(sig, () => onSignal(sig));
    }

    try {
        await $({ stdio: 'inherit' })`${command}`;
    } catch (p) {
        if (p.signal) {
            process.kill(process.pid, p.signal);
            return;
        }
        process.exit(p.exitCode ?? 1);
    }
}

main();
