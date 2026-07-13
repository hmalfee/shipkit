import { chalk, echo, fs, path } from 'zx';

import { findRepoRoot } from './git.js';

export function printUsage() {
    echo(
        chalk.blue(`Usage: run-on-staged [--help | --install | --init]

Run configured checks against the staged index in an isolated environment.

Commands:
  run-on-staged           Run all checks from config in isolated staged env
  run-on-staged --init    Create config in package.json + install git hook
  run-on-staged --install Install git pre-commit hook only
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
    echo(chalk.yellow('Run `run-on-staged --init` to create one.'));
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
        echo(chalk.yellow('Config already exists in package.json — skipping.'));
        return;
    }

    pkg['run-on-staged'] = {
        checks: [
            { name: 'Format', command: 'pnpm run format:check' },
            { name: 'Lint', command: 'pnpm run lint' },
            { name: 'Typecheck', command: 'pnpm run typecheck' },
        ],
    };

    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 4) + '\n');
    echo(chalk.green('✓ Added "run-on-staged" config to package.json'));
}
