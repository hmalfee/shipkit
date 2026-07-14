import { execSync } from 'node:child_process';

import { $, chalk, echo, fs, path } from 'zx';

const STASH_MSG = 'run-on-staged automatic backup';

/**
 * Returns a zx wrapper configured with submodule.recurse=false
 * to prevent git commands from leaking into submodules.
 */
function gitCmd(repoRoot) {
    return function (pieces, ...args) {
        const newPieces = [
            `git -c submodule.recurse=false ${pieces[0]}`,
            ...pieces.slice(1),
        ];
        return $({ cwd: repoRoot })(newPieces, ...args);
    };
}

/**
 * Hide unstaged changes so the working tree matches the index.
 * Returns a state object needed by restoreUnstagedChanges.
 */
export async function hideUnstagedChanges(repoRoot) {
    // Check if there are any unstaged changes to tracked files
    const hasDiff =
        (await gitCmd(repoRoot)`diff --quiet`.nothrow().quiet()).exitCode !== 0;

    // Check for untracked files too
    const untrackedOut = (
        await gitCmd(repoRoot)`ls-files --others --exclude-standard`.quiet()
    ).stdout.trim();
    const hasUntracked = untrackedOut.length > 0;

    if (!hasDiff && !hasUntracked) {
        return { hadChanges: false, restored: false };
    }

    // 1. Create a backup stash commit (does NOT touch working tree or stash list)
    const backupSha = (
        await gitCmd(repoRoot)`stash create -u`.quiet()
    ).stdout.trim();

    // 2. Store it in the stash list so it survives a crash
    if (backupSha) {
        await gitCmd(
            repoRoot,
        )`stash store -m ${STASH_MSG} ${backupSha}`.quiet();
    }

    // 3. Save unstaged diff of tracked files to a patch file
    const patchFile = path.join(repoRoot, '.git', 'run-on-staged.patch');
    if (hasDiff) {
        const diff = (
            await gitCmd(
                repoRoot,
            )`diff --binary --unified=0 --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ --patch --submodule=short`.quiet()
        ).stdout;
        await fs.writeFile(patchFile, diff);
    }

    // 4. Save list of untracked files
    const untrackedManifest = path.join(
        repoRoot,
        '.git',
        'run-on-staged-untracked.txt',
    );
    if (hasUntracked) {
        await fs.writeFile(untrackedManifest, untrackedOut);
        // Remove untracked files temporarily
        const files = untrackedOut.split('\n').filter(Boolean);
        for (const f of files) {
            const full = path.join(repoRoot, f);
            const stash = full + '.run-on-staged-bak';
            if (await fs.pathExists(full)) {
                await fs.move(full, stash);
            }
        }
    }

    // 5. Reset working tree to match the index (staged state only)
    if (hasDiff) {
        await gitCmd(repoRoot)`checkout -- .`.quiet();
    }

    return {
        hadChanges: true,
        restored: false,
        backupSha: backupSha || null,
        patchFile: hasDiff ? patchFile : null,
        untrackedManifest: hasUntracked ? untrackedManifest : null,
        repoRoot,
    };
}

/**
 * Restore unstaged changes from patch + move untracked files back.
 * Falls back to stash apply if patch apply fails.
 * Safe to call multiple times (idempotent via state.restored flag).
 */
export async function restoreUnstagedChanges(state) {
    if (!state.hadChanges || state.restored) return;
    state.restored = true; // prevent double-restore

    const { repoRoot } = state;

    // Restore tracked file changes from patch
    if (state.patchFile && (await fs.pathExists(state.patchFile))) {
        const applyResult = await gitCmd(
            repoRoot,
        )`apply --whitespace=nowarn --recount --unidiff-zero ${state.patchFile}`
            .nothrow()
            .quiet();

        if (applyResult.exitCode !== 0) {
            echo(
                chalk.yellow(
                    'Patch apply failed, attempting 3-way merge fallback...',
                ),
            );
            const mergeResult = await gitCmd(
                repoRoot,
            )`apply --whitespace=nowarn --recount --unidiff-zero --3way ${state.patchFile}`
                .nothrow()
                .quiet();

            if (mergeResult.exitCode !== 0) {
                echo(
                    chalk.yellow(
                        '3-way merge failed, falling back to backup stash...',
                    ),
                );
                if (state.backupSha) {
                    await gitCmd(repoRoot)`stash apply ${state.backupSha}`
                        .nothrow()
                        .quiet();
                }
            }
        }
        await fs.remove(state.patchFile);
    }

    // Restore untracked files
    if (
        state.untrackedManifest &&
        (await fs.pathExists(state.untrackedManifest))
    ) {
        const manifest = (
            await fs.readFile(state.untrackedManifest, 'utf8')
        ).trim();
        const files = manifest.split('\n').filter(Boolean);
        for (const f of files) {
            const full = path.join(repoRoot, f);
            const stash = full + '.run-on-staged-bak';
            if (await fs.pathExists(stash)) {
                await fs.move(stash, full, { overwrite: true });
            }
        }
        await fs.remove(state.untrackedManifest);
    }

    // Drop the backup stash
    if (state.backupSha) {
        const list = (
            await gitCmd(repoRoot)`stash list --format=${'%gd %gs'}`.quiet()
        ).stdout;
        for (const line of list.split('\n')) {
            if (line.includes(STASH_MSG)) {
                const ref = line.split(' ')[0];
                await gitCmd(repoRoot)`stash drop ${ref}`.nothrow().quiet();
                break;
            }
        }
    }
}

/**
 * Synchronous restore for signal handlers (exit, SIGINT, SIGTERM).
 * Uses execSync because async is not safe inside process.on('exit').
 */
function restoreSync(state) {
    if (!state.hadChanges || state.restored) return;
    state.restored = true;

    const { repoRoot } = state;
    const opts = { cwd: repoRoot, stdio: 'ignore' };
    const baseGitCmd = `git -c submodule.recurse=false`;

    try {
        // Restore tracked changes
        if (state.patchFile && fs.existsSync(state.patchFile)) {
            try {
                execSync(
                    `${baseGitCmd} apply --whitespace=nowarn --recount --unidiff-zero "${state.patchFile}"`,
                    opts,
                );
            } catch {
                try {
                    execSync(
                        `${baseGitCmd} apply --whitespace=nowarn --recount --unidiff-zero --3way "${state.patchFile}"`,
                        opts,
                    );
                } catch {
                    if (state.backupSha) {
                        try {
                            execSync(
                                `${baseGitCmd} stash apply ${state.backupSha}`,
                                opts,
                            );
                        } catch {}
                    }
                }
            }
            try {
                fs.removeSync(state.patchFile);
            } catch {}
        }

        // Restore untracked files
        if (state.untrackedManifest && fs.existsSync(state.untrackedManifest)) {
            try {
                const manifest = fs
                    .readFileSync(state.untrackedManifest, 'utf8')
                    .trim();
                for (const f of manifest.split('\n').filter(Boolean)) {
                    const full = path.join(repoRoot, f);
                    const stash = full + '.run-on-staged-bak';
                    if (fs.existsSync(stash)) {
                        fs.moveSync(stash, full, { overwrite: true });
                    }
                }
            } catch {}
            try {
                fs.removeSync(state.untrackedManifest);
            } catch {}
        }

        // Drop backup stash
        if (state.backupSha) {
            try {
                const list = execSync(
                    `${baseGitCmd} stash list --format="%gd %gs"`,
                    {
                        cwd: repoRoot,
                        encoding: 'utf8',
                    },
                );
                for (const line of list.split('\n')) {
                    if (line.includes(STASH_MSG)) {
                        const ref = line.split(' ')[0];
                        execSync(`${baseGitCmd} stash drop ${ref}`, opts);
                        break;
                    }
                }
            } catch {}
        }
    } catch {}
}

/**
 * Register signal handlers that restore unstaged changes on crash/kill.
 * stateRef is an object reference — it gets mutated by hideUnstagedChanges
 * after this is registered, so signal handlers always see current state.
 */
export function registerRestoreOnExit(stateRef) {
    const onExit = () => restoreSync(stateRef);
    const onSignal = (code) => () => {
        restoreSync(stateRef);
        process.exit(128 + code);
    };
    process.on('exit', onExit);
    process.on('SIGINT', onSignal(2));
    process.on('SIGTERM', onSignal(15));
}
