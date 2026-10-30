#!/usr/bin/env node
import { $, chalk, echo, path } from 'zx';

import { getWorkspaceRoot } from '../../lib/workspace.js';
import { registerAliases } from './aliases.js';
import { ensurePortless, ensureProxy, ensureSocat } from './portless.js';
import {
    cleanupSession,
    cleanupSessionSync,
    otherActiveSessions,
    registerSession,
} from './sessions.js';
import {
    getLanIp,
    parseMode,
    run,
    shellQuote,
    validateNames,
} from './utils.js';
import {
    discoverWorkspacePackages,
    injectAppUrls,
    killStaleNextDev,
} from './workspace-urls.js';

/**
 * Registers teardown for graceful signals and hard exits.
 *
 * Returns an idempotent `cleanup()` that runs the async teardown at most once
 * and hands every caller the same promise. The signal handlers and the
 * command's failure path all go through it, so whichever fires first does the
 * work and the others wait for it instead of killing the process mid-cleanup.
 *
 * @param {import('./sessions.js').SessionState} session
 * @returns {() => Promise<void>}
 */
function installCleanup(session) {
    /** @type {Promise<void> | null} */
    let started = null;
    const cleanup = () => (started ??= cleanupSession(session));

    // Fallback for exits that skip the async path (uncaught exception, a bare
    // process.exit()). 'exit' fires synchronously, hence the *Sync helper.
    // It does not fire for deaths by signal, which is why the handlers below
    // must finish cleanup before re-raising.
    process.once('exit', () => {
        if (started) return;
        started = Promise.resolve();
        try {
            cleanupSessionSync(session);
        } catch {}
    });

    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        process.once(sig, async () => {
            await cleanup();
            // Our listener is consumed by now, so this takes the default
            // action and terminates the process.
            process.kill(process.pid, sig);
        });
    }

    return cleanup;
}

/**
 * Entry point. Validates the environment, starts or reuses the shared proxy,
 * injects workspace URLs as environment variables, and then execs the user's
 * command. Depending on `--name` usage the command is wrapped in
 * `portless run` (zero or one name) or run directly with one static alias
 * and `<NAME>_PORT` per name (two or more).
 */
async function main() {
    const {
        mode,
        names,
        persist,
        command: rawArgs,
    } = parseMode(process.argv.slice(2));
    validateNames(names);
    const multi = names.length > 1;
    // `--name` overrides the routing name derived from the package dir, so a
    // package running one independently-routed process doesn't collide under
    // the package name.
    const singleName = multi ? null : (names[0] ?? null);

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
    /** @type {import('./sessions.js').SessionState} */
    const session = {
        sessionFile,
        nodeBin,
        portlessCli,
        socatPid,
        aliasNames: [],
    };
    await run`portless prune`;

    const packages = await discoverWorkspacePackages(rootDir);
    const currentPkg = packages.find(
        (p) => path.resolve(p.dir) === path.resolve(process.cwd()),
    );
    const routeName = singleName || currentPkg?.shortName;

    // URL vars for every workspace package, plus any explicitly named routes.
    // `routeName` needs no separate add: it is either `singleName` (in
    // `names`) or `currentPkg.shortName` (in `packages`).
    const urlNames = new Set(packages.map((p) => p.shortName));
    for (const n of names) urlNames.add(n);
    injectAppUrls([...urlNames], mode, lanIp);

    // Skip when any --name is given: likely docker sub-services, not Next.js —
    // concurrent invocations from the same dir shouldn't race the lock file.
    if (currentPkg && names.length === 0)
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

    // `--persist` keeps the route alive after commands that exit quickly by
    // design (e.g. `docker compose up -d`): on success, chain `exec sleep
    // infinity` so the wrapped process stays alive; a failing command still
    // fails immediately.
    const keepAlive = persist
        ? [
              'sh',
              '-c',
              `${rawArgs.map(shellQuote).join(' ')} && exec sleep infinity`,
          ]
        : rawArgs;

    let command;
    if (multi) {
        // Several routes can't share one `portless run` (one PORT, one name),
        // so run directly and register static aliases below.
        command = keepAlive;
    } else if (currentPkg || singleName) {
        // Wrap in `portless run` inside a known package, or whenever `--name`
        // supplies a stable route name explicitly (e.g. from the repo root).
        command = [
            'portless',
            'run',
            '--force',
            '--name',
            routeName,
            ...keepAlive,
        ];
    } else {
        command = rawArgs;
    }

    // Handlers go in *before* aliases are registered so a failure partway
    // through registration still cleans up what was already registered.
    const cleanup = installCleanup(session);
    if (multi) {
        echo(chalk.blue('Registering routes:'));
        await registerAliases(names, session.aliasNames);
    }

    try {
        await $({ stdio: 'inherit' })`${command}`;
    } catch (p) {
        // Finish (or join) teardown before exiting. On Ctrl+C the child dies
        // while a signal handler may still be mid-cleanup; exiting here
        // without waiting would cut it short and leak aliases.
        await cleanup();
        if (p.signal) {
            process.kill(process.pid, p.signal);
            return;
        }
        process.exit(p.exitCode ?? 1);
    }
}

main();
