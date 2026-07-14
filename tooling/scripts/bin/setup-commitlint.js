#!/usr/bin/env node
import { $, chalk, echo, fs, path } from 'zx';

const HOOK_COMMAND = 'pnpm exec commitlint --edit "$1"';

function findRepoRoot() {
    let dir = process.cwd();
    while (dir !== '/') {
        if (fs.existsSync(path.join(dir, '.git'))) return dir;
        dir = path.dirname(dir);
    }
    return null;
}

async function initConfig(root) {
    // Check package.json first
    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkgData = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
            if (pkgData.commitlint) {
                echo(
                    chalk.yellow(
                        'commitlint config already exists in package.json - skipping.',
                    ),
                );
                return;
            }
        } catch (e) {
            // Ignore parse errors
        }
    }

    // Check for common config files
    const configFiles = [
        'commitlint.config.js',
        'commitlint.config.cjs',
        'commitlint.config.mjs',
        'commitlint.config.ts',
        '.commitlintrc',
        '.commitlintrc.json',
        '.commitlintrc.yaml',
        '.commitlintrc.yml',
        '.commitlintrc.js',
        '.commitlintrc.cjs',
        '.commitlintrc.mjs',
        '.commitlintrc.ts',
    ];

    for (const file of configFiles) {
        if (fs.existsSync(path.join(root, file))) {
            echo(
                chalk.yellow(
                    `commitlint config already exists in ${file} - skipping.`,
                ),
            );
            return;
        }
    }

    echo(chalk.blue('Setting up commitlint config...'));
    const configPath = path.join(root, 'commitlint.config.mjs');
    await fs.writeFile(
        configPath,
        `export default { extends: ['@commitlint/config-conventional'] };\n`,
    );
    echo(chalk.green('✓ Created commitlint.config.mjs'));
    echo(chalk.cyan('\nPlease install the required dependencies by running:'));
    echo(
        chalk.yellow(
            '  pnpm add -D -w @commitlint/cli @commitlint/config-conventional\n',
        ),
    );
}

async function installHook(root) {
    const hookPath = path.join(root, '.git', 'hooks', 'commit-msg');

    if (fs.existsSync(hookPath)) {
        const content = await fs.readFile(hookPath, 'utf8');
        if (content.includes('commitlint')) {
            echo(
                chalk.yellow(
                    'commitlint already installed in commit-msg hook - skipping.',
                ),
            );
            return;
        }
        echo(chalk.blue('Setting up commit-msg hook...'));
        echo(
            chalk.yellow(
                'Existing commit-msg hook found — preserving and appending commitlint.',
            ),
        );
        await fs.writeFile(
            hookPath,
            `${content.trimEnd()}\n\n${HOOK_COMMAND}\n`,
        );
        await $`chmod +x ${hookPath}`;
        echo(chalk.green('✓ commitlint appended to existing commit-msg hook'));
        return;
    }

    echo(chalk.blue('Setting up commit-msg hook...'));
    await fs.writeFile(hookPath, `#!/bin/bash\n${HOOK_COMMAND}\n`);
    await $`chmod +x ${hookPath}`;
    echo(chalk.green('✓ Git commit-msg hook installed'));
}

async function main() {
    const root = findRepoRoot();
    if (!root) {
        echo(chalk.red('Not a git repository.'));
        process.exit(1);
    }

    await initConfig(root);
    await installHook(root);
}

main();
