import { $, chalk, echo, fs, path } from 'zx';

const HOOK_COMMAND = 'pnpm exec run-on-staged';

export function findRepoRoot() {
    let dir = process.cwd();
    while (dir !== '/') {
        if (fs.existsSync(path.join(dir, '.git'))) return dir;
        dir = path.dirname(dir);
    }
    return null;
}

export async function verifyGitState(repoRoot) {
    if (!fs.existsSync(path.join(repoRoot, '.git'))) {
        echo(chalk.red('Not a git repository.'));
        process.exit(1);
    }

    if ((await $`git rev-parse HEAD`.nothrow().quiet()).exitCode !== 0) {
        echo(chalk.yellow('Initial commit — skipping pre-commit checks.'));
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

export async function installHook() {
    const root = findRepoRoot();
    if (!root) {
        echo(chalk.red('Not a git repository.'));
        process.exit(1);
    }

    const hookPath = path.join(root, '.git', 'hooks', 'pre-commit');
    if (fs.existsSync(hookPath)) {
        const content = await fs.readFile(hookPath, 'utf8');
        if (content.includes(HOOK_COMMAND)) {
            echo(
                chalk.yellow(
                    'run-on-staged already installed in pre-commit hook - skipping.',
                ),
            );
            return;
        }
        echo(chalk.blue('Setting up pre-commit hook...'));
        echo(
            chalk.yellow(
                'Existing pre-commit hook found — preserving and appending run-on-staged.',
            ),
        );
        await fs.writeFile(
            hookPath,
            `${content.trimEnd()}\\n\\n${HOOK_COMMAND}\\n`,
        );
        await $`chmod +x ${hookPath}`;
        echo(
            chalk.green('✓ run-on-staged appended to existing pre-commit hook'),
        );
        return;
    }

    echo(chalk.blue('Setting up pre-commit hook...'));
    await fs.writeFile(hookPath, `#!/bin/bash\n${HOOK_COMMAND}\n`);
    await $`chmod +x ${hookPath}`;
    echo(chalk.green('✓ Git pre-commit hook installed'));
}
