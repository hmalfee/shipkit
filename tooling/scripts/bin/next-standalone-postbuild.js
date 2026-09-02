#!/usr/bin/env node
import { $, chalk, echo, fs, path, spinner } from 'zx';

import { getWorkspaceRoot } from '../lib/workspace.js';

$.verbose = false;

// process.cwd() avoids a shell roundtrip — no need to fork a subshell just for pwd.
const CURRENT_DIR = process.cwd();

let WORKSPACE_ROOT;
try {
    WORKSPACE_ROOT = await getWorkspaceRoot(CURRENT_DIR);
} catch {
    echo(
        chalk.red(
            'Error: Could not find workspace root (is this being run inside a pnpm workspace?)',
        ),
    );
    process.exit(1);
}

// Calculate the relative path from workspace root to the current app directory
const APP_RELATIVE_PATH = path.relative(WORKSPACE_ROOT, CURRENT_DIR);

const NEXT_DIR = '.next';
const STANDALONE_DIR = `${NEXT_DIR}/standalone`;
const TARGET_APP_DIR = `${STANDALONE_DIR}/${APP_RELATIVE_PATH}`;
const TARGET_NEXT_DIR = `${TARGET_APP_DIR}/.next`;
const TARGET_STATIC_DIR = `${TARGET_NEXT_DIR}/static`;
const TARGET_PUBLIC_DIR = `${TARGET_APP_DIR}/public`;

if (!(await fs.pathExists(STANDALONE_DIR))) {
    echo(
        chalk.red(
            `[ERROR] Standalone directory (${STANDALONE_DIR}) does not exist.`,
        ),
    );
    echo(
        chalk.yellow(
            `It looks like this Next.js build was not configured as a standalone build.`,
        ),
    );
    echo(
        chalk.yellow(
            `Please ensure 'output: "standalone"' is set in your next.config.ts/js.`,
        ),
    );
    process.exit(1);
}

echo('Running Next.js standalone postbuild script...');

// 1. Ensure target .next directory exists — fs.ensureDir replaces `mkdir -p`.
await fs.ensureDir(TARGET_NEXT_DIR);

// 2. Copy static files if they exist — fs.copy replaces `cp -r`.
if (await fs.pathExists(`${NEXT_DIR}/static`)) {
    await spinner('Copying static files…', () =>
        fs.copy(`${NEXT_DIR}/static`, TARGET_STATIC_DIR),
    );
    echo(chalk.green('✓ Copied static files'));
} else {
    echo(chalk.yellow('⚠ No .next/static directory found, skipping.'));
}

// 3. Copy public files if they exist
if (await fs.pathExists('public')) {
    await spinner('Copying public directory…', () =>
        fs.copy('public', TARGET_PUBLIC_DIR),
    );
    echo(chalk.green('✓ Copied public files'));
}

// 4. Clean up all directories/files in .next EXCEPT standalone and cache (since it can speed up subsequent builds).
await spinner(
    'Cleaning up non-standalone artifacts…',
    () =>
        $`find ${NEXT_DIR} -mindepth 1 -maxdepth 1 ! -name standalone ! -name cache -exec rm -rf {} +`,
);
echo(chalk.green('✓ Cleaned up non-standalone Next.js artifacts'));

echo(chalk.green(`✨ Standalone build finalized at ${STANDALONE_DIR}`));
echo(
    chalk.blue(
        `🌐 You can now run your app with: node ${TARGET_APP_DIR}/server.js`,
    ),
);
