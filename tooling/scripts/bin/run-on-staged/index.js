#!/usr/bin/env node
import { chalk, echo } from 'zx';

import { runCheck } from './checks.js';
import { initConfig, loadConfig, printUsage } from './config.js';
import { initEnvironment, registerCleanup } from './environment.js';
import { findRepoRoot, installHook, verifyGitState } from './git.js';

async function main() {
    const flag = process.argv[2];

    if (flag === '--help') {
        printUsage();
        process.exit(0);
    }

    if (flag === '--init') {
        await initConfig();
        await installHook();
        process.exit(0);
    }

    if (flag === '--install') {
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
    const tempDir = await initEnvironment(repoRoot);
    registerCleanup(tempDir);

    echo(
        chalk.blue(
            `\nRunning ${config.checks.length} check(s) on staged files...\n`,
        ),
    );

    for (const check of config.checks) {
        const ok = await runCheck(
            check.name,
            check.command,
            check.env ?? {},
            tempDir,
        );
        if (!ok) process.exit(1);
    }

    echo(chalk.green('\n✓ All checks passed'));
}

main();
