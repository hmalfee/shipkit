#!/usr/bin/env node
import { chalk, echo } from 'zx';

import { runCheck } from './checks.js';
import { initConfig, loadConfig, printUsage } from './config.js';
import {
    hideUnstagedChanges,
    registerRestoreOnExit,
    restoreUnstagedChanges,
} from './environment.js';
import { findRepoRoot, installHook, verifyGitState } from './git.js';

async function main() {
    const flag = process.argv[2];

    if (flag === '--help') {
        printUsage();
        process.exit(0);
    }

    if (flag === '--setup') {
        await initConfig();
        await installHook();
        process.exit(0);
    }

    const repoRoot = findRepoRoot();
    if (!repoRoot) {
        echo(chalk.red('Not a git repository.'));
        process.exit(1);
    }

    await verifyGitState(repoRoot);
    const config = loadConfig(repoRoot);

    // Register signal handler first with empty state ref
    const stateRef = { hadChanges: false, restored: false };
    registerRestoreOnExit(stateRef);

    // Hide unstaged changes — mutates stateRef fields
    const state = await hideUnstagedChanges(repoRoot);
    Object.assign(stateRef, state);

    echo(
        chalk.blue(
            `\nRunning ${config.checks.length} check(s) on staged files...\n`,
        ),
    );

    let failed = false;
    for (const check of config.checks) {
        const ok = await runCheck(
            check.name,
            check.command,
            check.env ?? {},
            repoRoot,
        );
        if (!ok) {
            failed = true;
            break;
        }
    }

    await restoreUnstagedChanges(stateRef);

    if (failed) process.exit(1);
    echo(chalk.green('\n✓ All checks passed'));
}

main();
