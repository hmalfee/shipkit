#!/usr/bin/env node
import { chalk, echo, fs, path } from 'zx';

import {
    findRepoRoot,
    hideUnstagedChanges,
    registerRestoreOnExit,
    restoreUnstagedChanges,
    verifyGitState,
} from './git.js';
import {
    buildTaskMatchers,
    resolveWorkspacePackagesIfNeeded,
    taskMatchesStagedFiles,
} from './match.js';
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

/**
 * Normalizes supported config shapes into one task shape.
 *  - array of strings: `["pnpm lint", "pnpm typecheck"]`
 *  - array of objects: `[{ command, name?, env?, match? }]`
 *  - mixed array of both
 */
function normalizeTasks(config) {
    if (!Array.isArray(config)) {
        echo(chalk.red('Invalid config: run-on-staged must be an array.'));
        process.exit(1);
    }
    return config.map((entry) => {
        if (typeof entry === 'string') {
            return { name: entry, command: entry, env: {}, match: null };
        }
        return {
            name: entry.name ?? entry.command,
            command: entry.command,
            env: entry.env ?? {},
            match: entry.match?.length ? entry.match : null,
        };
    });
}

async function main() {
    const repoRoot = findRepoRoot();
    if (!repoRoot) {
        echo(chalk.red('Not a git repository.'));
        process.exit(1);
    }

    const stagedFiles = await verifyGitState(repoRoot);
    const config = loadConfig(repoRoot);
    const tasks = normalizeTasks(config);

    const workspacePackages = await resolveWorkspacePackagesIfNeeded(
        repoRoot,
        tasks,
    );
    const matchers = buildTaskMatchers(tasks, workspacePackages);
    const tasksToRun = matchers.filter((task) =>
        taskMatchesStagedFiles(task, stagedFiles),
    );

    if (tasksToRun.length === 0) {
        echo(chalk.yellow('No tasks match the staged changes — skipping.'));
        process.exit(0);
    }

    // Register signal handler first with empty state ref
    const stateRef = { hadChanges: false, restored: false };
    registerRestoreOnExit(stateRef);

    // Hide unstaged changes — mutates stateRef fields
    const state = await hideUnstagedChanges(repoRoot);
    Object.assign(stateRef, state);

    const skipped = matchers.filter((t) => !tasksToRun.includes(t));
    echo(
        chalk.blue(
            `\nRunning ${tasksToRun.length} task(s) on staged files` +
                (skipped.length ? ` (${skipped.length} skipped)` : '') +
                '...\n',
        ),
    );
    for (const task of skipped) {
        echo(chalk.dim(`⊘ ${task.name} (skipped)`));
    }

    let failed = false;
    for (const task of tasksToRun) {
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
