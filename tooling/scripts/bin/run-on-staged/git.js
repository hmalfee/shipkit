import { execFileSync, execSync } from 'node:child_process';

import { $, chalk, echo, fs, path } from 'zx';

const STASH_MSG = 'run-on-staged automatic backup';
const GIT = 'git -c submodule.recurse=false';

function git(repoRoot) {
    return (pieces, ...values) => {
        const prefixed = [`${GIT} ${pieces[0]}`, ...pieces.slice(1)];
        return $({ cwd: repoRoot })(prefixed, ...values);
    };
}

export function findRepoRoot() {
    try {
        return execSync('git rev-parse --show-toplevel', {
            encoding: 'utf8',
        }).trim();
    } catch {
        return null;
    }
}

export async function verifyGitState(repoRoot) {
    if (!fs.existsSync(path.join(repoRoot, '.git'))) {
        echo(chalk.red('Not a git repository.'));
        process.exit(1);
    }

    if ((await $`git rev-parse HEAD`.nothrow().quiet()).exitCode !== 0) {
        echo(chalk.yellow('Initial commit — skipping tasks.'));
        process.exit(0);
    }

    const staged = (
        await $`git diff --cached --name-only`.quiet()
    ).stdout.trim();
    if (!staged) {
        echo(chalk.yellow('No staged changes — skipping.'));
        process.exit(0);
    }
}

export async function hideUnstagedChanges(repoRoot) {
    const hasDiff =
        (await git(repoRoot)`diff --quiet`.nothrow().quiet()).exitCode !== 0;

    const untrackedOut = (
        await git(repoRoot)`ls-files --others --exclude-standard`.quiet()
    ).stdout.trim();
    const hasUntracked = untrackedOut.length > 0;

    if (!hasDiff && !hasUntracked) {
        return { hadChanges: false, restored: false };
    }

    const includeUntracked = hasUntracked ? ['--include-untracked'] : [];
    await git(
        repoRoot,
    )`stash push --keep-index ${includeUntracked} --message ${STASH_MSG}`
        .nothrow()
        .quiet();

    echo(chalk.dim('(if process is killed: git stash pop --index)\n'));

    return { hadChanges: true, restored: false, repoRoot };
}

export async function restoreUnstagedChanges(state) {
    if (!state.hadChanges || state.restored) return;
    state.restored = true;

    const stashRef = await findStashRef(state.repoRoot);
    if (!stashRef) return;

    await git(state.repoRoot)`reset --hard HEAD`.nothrow().quiet();
    const result = await git(
        state.repoRoot,
    )`stash pop --quiet --index ${stashRef}`
        .nothrow()
        .quiet();

    if (result.exitCode !== 0) {
        echo(
            chalk.yellow(
                'Warning: stash pop had conflicts. Your changes are preserved in the stash — run `git stash show` to inspect.',
            ),
        );
    }
}

async function findStashRef(repoRoot) {
    const list = (await git(repoRoot)`stash list --format=${'%gd %gs'}`.quiet())
        .stdout;
    for (const line of list.split('\n')) {
        if (line.includes(STASH_MSG)) {
            return line.split(' ')[0];
        }
    }
    return null;
}

function restoreSync(state) {
    if (!state.hadChanges || state.restored) return;
    state.restored = true;

    try {
        const list = execFileSync(
            'git',
            [
                '-c',
                'submodule.recurse=false',
                'stash',
                'list',
                '--format=%gd %gs',
            ],
            { cwd: state.repoRoot, encoding: 'utf8' },
        );
        for (const line of list.split('\n')) {
            if (line.includes(STASH_MSG)) {
                const ref = line.split(' ')[0];
                execFileSync(
                    'git',
                    [
                        '-c',
                        'submodule.recurse=false',
                        'reset',
                        '--hard',
                        'HEAD',
                    ],
                    {
                        cwd: state.repoRoot,
                        stdio: 'ignore',
                    },
                );
                execFileSync(
                    'git',
                    [
                        '-c',
                        'submodule.recurse=false',
                        'stash',
                        'pop',
                        '--quiet',
                        '--index',
                        ref,
                    ],
                    {
                        cwd: state.repoRoot,
                        stdio: 'ignore',
                    },
                );
                break;
            }
        }
    } catch {
        // ponytail: best-effort restore on crash — stash is still in reflog if this fails
    }
}

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
