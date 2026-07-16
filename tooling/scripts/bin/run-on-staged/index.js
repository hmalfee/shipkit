#!/usr/bin/env node
import { chalk, echo, fs, path } from 'zx';

import {
    findRepoRoot,
    hideUnstagedChanges,
    registerRestoreOnExit,
    restoreUnstagedChanges,
    verifyGitState,
} from './git.js';
import { runTask } from './tasks.js';

function loadConfig(repoRoot) {
    const pkgPath = path.join(repoRoot, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg['run-on-staged']) return pkg['run-on-staged'];

    const rcPath = path.join(repoRoot, '.run-on-staged.json');
    if (fs.existsSync(rcPath))
        return JSON.parse(fs.readFileSync(rcPath, 'utf8'));

    echo(chalk.red('No run-on-staged config found.'));
    process.exit(1);
}

async function main() {
    const repoRoot = findRepoRoot();
    if (!repoRoot) {
        echo(chalk.red('Not a git repository.'));
        process.exit(1);
    }

    await verifyGitState(repoRoot);
    const config = loadConfig(repoRoot);

    const tasks = Array.isArray(config)
        ? config.map((command) => ({ name: command, command, env: {} }))
        : config.tasks || [];

    // Register signal handler first with empty state ref
    const stateRef = { hadChanges: false, restored: false };
    registerRestoreOnExit(stateRef);

    // Hide unstaged changes — mutates stateRef fields
    const state = await hideUnstagedChanges(repoRoot);
    Object.assign(stateRef, state);

    echo(chalk.blue(`\nRunning ${tasks.length} task(s) on staged files...\n`));

    let failed = false;
    for (const task of tasks) {
        const ok = await runTask(
            task.name,
            task.command,
            task.env ?? {},
            repoRoot,
        );
        if (!ok) {
            failed = true;
            break;
        }
    }

    await restoreUnstagedChanges(stateRef);

    if (failed) process.exit(1);
    echo(chalk.green('\n✓ All tasks passed'));
}

main();
