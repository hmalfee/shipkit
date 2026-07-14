import { chalk, echo, fs, path } from 'zx';

import { findRepoRoot } from './git.js';

export function printUsage() {
    echo(
        chalk.blue(`Usage: run-on-staged [--help | --setup]

Run configured checks against staged files (unstaged changes are temporarily hidden).

Commands:
  run-on-staged           Run all checks from config in isolated staged env
  run-on-staged --setup   Create config if missing and install git pre-commit hook
  run-on-staged --help    Show this help`),
    );
}

export function loadConfig(repoRoot) {
    const pkgPath = path.join(repoRoot, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg['run-on-staged']) return pkg['run-on-staged'];

    const rcPath = path.join(repoRoot, '.run-on-staged.json');
    if (fs.existsSync(rcPath))
        return JSON.parse(fs.readFileSync(rcPath, 'utf8'));

    echo(chalk.red('No run-on-staged config found.'));
    echo(chalk.yellow('Run `run-on-staged --setup` to create one.'));
    process.exit(1);
}

export async function initConfig() {
    const root = findRepoRoot();
    if (!root) {
        echo(chalk.red('Not a git repository.'));
        process.exit(1);
    }

    const pkgPath = path.join(root, 'package.json');
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));

    if (pkg['run-on-staged']) {
        echo(
            chalk.yellow(
                'run-on-staged config already exists in package.json - skipping.',
            ),
        );
        return;
    }

    const rcPath = path.join(root, '.run-on-staged.json');
    if (fs.existsSync(rcPath)) {
        echo(
            chalk.yellow(
                'run-on-staged config already exists in .run-on-staged.json - skipping.',
            ),
        );
        return;
    }

    const config = {
        checks: [
            { name: 'Format', command: 'pnpm run format:check' },
            { name: 'Lint', command: 'pnpm run lint' },
            { name: 'Typecheck', command: 'pnpm run typecheck' },
        ],
    };

    echo(chalk.blue('Setting up run-on-staged config...'));
    await fs.writeFile(rcPath, JSON.stringify(config, null, 4) + '\n');
    echo(chalk.green('✓ Created .run-on-staged.json'));
}
