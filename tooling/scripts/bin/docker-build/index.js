#!/usr/bin/env node
import { cancel, isCancel, select } from '@clack/prompts';
import { $, chalk, echo, fs, os, path } from 'zx';

import { resolvePackagesUnder } from '../../lib/workspace.js';

$.verbose = false;

const args = process.argv.slice(2);
let appName = args.find((a) => !a.startsWith('--'));
const envFileArg = args.find((a) => a.startsWith('--build-env-file='));
const cacheRefArg = args.find((a) => a.startsWith('--cache-ref='));
const cacheRef = cacheRefArg?.split('=').slice(1).join('=') ?? null;
const pushRefArg = args.find((a) => a.startsWith('--push-ref='));
const pushRef = pushRefArg?.split('=').slice(1).join('=') ?? null;
const cacheFromRefArg = args.find((a) => a.startsWith('--cache-from-ref='));
const cacheFromRef = cacheFromRefArg?.split('=').slice(1).join('=') ?? null;

try {
    await $`git rev-parse --is-inside-work-tree`.quiet();
} catch {
    echo(chalk.red('Error: Not inside a git repository.'));
    process.exit(1);
}
const root = (await $`git rev-parse --show-toplevel`).stdout.trim();

const rootPkgPath = path.join(root, 'package.json');
if (!(await fs.pathExists(rootPkgPath))) {
    echo(chalk.red(`Error: root package.json not found at ${rootPkgPath}`));
    process.exit(1);
}
const rootPkg = await fs.readJson(rootPkgPath);
const nodeVersion = rootPkg.engines?.node?.split('.')[0];
const pnpmVersion = rootPkg.packageManager?.split('@')[1];
const turboVersion = rootPkg.devDependencies?.turbo;
if (!nodeVersion || !pnpmVersion || !turboVersion) {
    echo(
        chalk.red(
            'Error: root package.json must have engines.node, packageManager, and devDependencies.turbo fields.',
        ),
    );
    process.exit(1);
}

const appsPackages = await resolvePackagesUnder(root, 'apps');

// Build the Dockerfile-filtered list once — used for interactive selection and validation.
const appsWithDockerfile = (
    await Promise.all(
        [...appsPackages.entries()].map(async ([name, dir]) => {
            const hasDockerfile = await fs.pathExists(
                path.join(root, dir, 'Dockerfile'),
            );
            return hasDockerfile ? name : null;
        }),
    )
)
    .filter(Boolean)
    .sort();

if (!appName) {
    if (appsWithDockerfile.length === 0) {
        echo(chalk.red('No apps with a Dockerfile found.'));
        process.exit(1);
    }
    if (appsWithDockerfile.length === 1) {
        appName = appsWithDockerfile[0];
    } else {
        const selected = await select({
            message: 'Select an app to build',
            options: appsWithDockerfile.map((n) => ({ value: n, label: n })),
        });
        if (isCancel(selected)) {
            cancel('Operation cancelled.');
            process.exit(0);
        }
        appName = selected;
    }
}

const appFolder = appsPackages.get(appName);

if (!appFolder) {
    echo(
        chalk.red(
            `App "${appName}" not found. Available: ${appsWithDockerfile.join(', ')}`,
        ),
    );
    process.exit(1);
}

const dockerfilePath = path.join(root, appFolder, 'Dockerfile');
if (!(await fs.pathExists(dockerfilePath))) {
    echo(
        chalk.red(
            `No Dockerfile found in ${appFolder}/. Apps with Dockerfiles: ${appsWithDockerfile.join(', ')}`,
        ),
    );
    process.exit(1);
}

let envFilePath = null;
if (envFileArg) {
    const raw = envFileArg
        .split('=')
        .slice(1)
        .join('=')
        .replace('{APP_FOLDER}', appFolder);
    envFilePath = path.resolve(root, raw);
    if (!(await fs.pathExists(envFilePath))) {
        echo(chalk.red(`Error: env file not found: ${raw}`));
        process.exit(1);
    }
}

// Ensure a docker-container builder exists — required for type=registry cache and
// cross-build --mount=type=cache persistence. Uses network=host so it can reach
// insecure registries on 127.0.0.1 (the SSH-tunneled registry in CI).
const BUILDER_NAME = 'shipkit-builder';
try {
    await $`docker buildx inspect ${BUILDER_NAME}`.quiet();
    echo(chalk.blue(`Using existing buildx builder: ${BUILDER_NAME}`));
} catch {
    echo(chalk.blue(`Creating buildx builder: ${BUILDER_NAME}...`));
    await $`docker buildx create \
        --name ${BUILDER_NAME} \
        --driver docker-container \
        --driver-opt network=host \
        --bootstrap`;
}

try {
    const secretArgs = envFilePath
        ? ['--secret', `id=env_build,src=${envFilePath}`]
        : [];
    let envHashArgs = [];
    if (envFilePath) {
        const crypto = await import('crypto');
        const content = await fs.readFile(envFilePath, 'utf8');
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        envHashArgs = ['--build-arg', `ENV_HASH=${hash}`];
        echo(chalk.blue(`ENV_HASH: ${hash.slice(0, 12)}…`));
    }
    const cacheArgs = cacheRef
        ? [
              '--cache-from',
              `type=registry,ref=${cacheRef}`,
              ...(cacheFromRef
                  ? ['--cache-from', `type=registry,ref=${cacheFromRef}`]
                  : []),
              '--cache-to',
              `type=registry,ref=${cacheRef},mode=max`,
          ]
        : [];
    echo(chalk.blue(`Packaging build context for ${appName}...`));

    const files = (
        await $`git -C ${root} ls-files -c -o --exclude-standard`
    ).stdout
        .trim()
        .split('\n')
        .filter((f) => f && fs.existsSync(path.join(root, f)));

    // Build context breakdown by top-level path — cheap insurance against
    // silent bloat (e.g. a store-dir or cache folder landing in the repo
    // and slipping past .gitignore).
    const dirSizes = {};
    for (const f of files) {
        let size = 0;
        try {
            size = (await fs.stat(path.join(root, f))).size;
        } catch {}
        const top = f.split('/').slice(0, 3).join('/');
        dirSizes[top] = (dirSizes[top] ?? 0) + size;
    }
    const sorted = Object.entries(dirSizes).sort((a, b) => b[1] - a[1]);
    echo(chalk.yellow(`Build context breakdown (${files.length} files):`));
    for (const [dir, size] of sorted.slice(0, 25)) {
        echo(`  ${(size / 1024 / 1024).toFixed(2)}MB  ${dir}`);
    }

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'docker-build-'));
    let fallbackToCopy = false;
    try {
        echo(chalk.blue(`Creating clean working tree in ${tmp}...`));
        for (const f of files) {
            const src = path.join(root, f);
            const dest = path.join(tmp, f);
            await fs.ensureDir(path.dirname(dest));
            try {
                if (!fallbackToCopy) await fs.link(src, dest);
                else await fs.copy(src, dest);
            } catch (e) {
                if (e.code === 'EXDEV') {
                    fallbackToCopy = true;
                    await fs.copy(src, dest);
                } else throw e;
            }
        }

        echo(chalk.green(`Running docker buildx build for ${appName}...`));
        // If --push-ref given: stream directly to registry (skips local daemon load/decompress/recompress).
        // Otherwise: load into local daemon for manual tagging/pushing.
        const outputArgs = pushRef
            ? ['--push', '-t', pushRef]
            : ['--load', '-t', appName];

        await $({
            cwd: tmp,
            stdio: 'inherit',
        })`docker buildx build \
            --builder ${BUILDER_NAME} \
            --build-arg NODE_VERSION=${nodeVersion} \
            --build-arg PNPM_VERSION=${pnpmVersion} \
            --build-arg TURBO_VERSION=${turboVersion.replace('^', '').replace('~', '')} \
            --build-arg APP_NAME=${appName} \
            ${envHashArgs} \
            ${secretArgs} \
            ${cacheArgs} \
            ${outputArgs} \
            -f ${dockerfilePath} \
            .`;
    } finally {
        await fs.rm(tmp, { recursive: true, force: true });
    }
} catch (e) {
    if (e.exitCode !== undefined) process.exit(e.exitCode);
    echo(chalk.red(e.stack || e));
    process.exit(1);
}
