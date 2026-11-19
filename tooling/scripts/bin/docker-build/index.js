#!/usr/bin/env node
import crypto from 'node:crypto';

import { cancel, isCancel, select } from '@clack/prompts';
import { $, chalk, echo, fs, os, path } from 'zx';

import { timed } from '../../lib/timed.js';
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
const noPnpmSeed = args.includes('--no-pnpm-seed');

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

// Ensure a docker-container builder exists — required for type=registry cache.
// Uses network=host so it can reach insecure registries on 127.0.0.1 (the SSH-tunneled registry in CI).
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

// ── pnpm store seeding ──────────────────────────────────────────────────────

// Matches `id=` on the pnpm cache mount in app Dockerfiles
const PNPM_CACHE_ID = 'pnpm';
const PNPM_CACHE_MOUNT = `--mount=type=cache,id=${PNPM_CACHE_ID},target=/pnpm/store,sharing=locked`;

// Pre-populates the BuildKit cache mount from the host pnpm store.
// Runs as an isolated build so it doesn't affect the app's layer cache,
// and skips via a lockfile-hash marker if already seeded on this builder.
async function seedPnpmCache(storeDir) {
    const versionDir = path.basename(storeDir);
    try {
        const lockHash = crypto
            .createHash('sha256')
            .update(await fs.readFile(path.join(root, 'pnpm-lock.yaml')))
            .digest('hex')
            .slice(0, 16);

        const header = `# syntax=docker/dockerfile:1\nFROM node:${nodeVersion}-alpine\nARG LOCK_HASH\n`;
        const baseArgs = [
            '--builder',
            BUILDER_NAME,
            '--no-cache',
            '--build-arg',
            `LOCK_HASH=${lockHash}`,
            '--output',
            'type=cacheonly',
            '-f',
            '-',
        ];

        // Check if cache mount is already seeded for this lockfile
        const probeCtx = await fs.mkdtemp(
            path.join(os.tmpdir(), 'pnpm-seed-probe-'),
        );
        try {
            const probe = await $({
                input: `${header}RUN ${PNPM_CACHE_MOUNT} test "$(cat /pnpm/store/.seeded 2>/dev/null)" = "$LOCK_HASH"\n`,
                nothrow: true,
                quiet: true,
            })`docker buildx build ${baseArgs} ${probeCtx}`;
            if (probe.exitCode === 0) {
                echo(chalk.blue('pnpm cache mount already seeded; skipping.'));
                return;
            }
        } finally {
            await fs.rm(probeCtx, { recursive: true, force: true });
        }

        // Copy host store into the cache mount
        echo(chalk.blue(`Seeding pnpm cache mount from ${storeDir}...`));
        const seedDockerfile =
            `${header}RUN ${PNPM_CACHE_MOUNT} \\\n` +
            `    --mount=type=bind,target=/seed \\\n` +
            `    mkdir -p /pnpm/store/${versionDir} \\\n` +
            `    && cp -a /seed/. /pnpm/store/${versionDir}/ \\\n` +
            `    && echo "$LOCK_HASH" > /pnpm/store/.seeded\n`;
        await $({
            input: seedDockerfile,
            stdio: ['pipe', 'inherit', 'inherit'],
        })`docker buildx build ${baseArgs} --progress=plain ${storeDir}`;
        echo(chalk.green('pnpm cache mount seeded.'));
    } catch (e) {
        echo(
            chalk.yellow(
                `pnpm cache seed failed, continuing without it: ${e.message ?? e}`,
            ),
        );
    }
}

// Checks if pnpm-lock.yaml is untracked, modified, or changed in HEAD~1
async function lockfileChanged() {
    const tracked =
        await $`git -C ${root} ls-files --error-unmatch pnpm-lock.yaml`
            .nothrow()
            .quiet();
    if (tracked.exitCode !== 0) return true;

    const diff = await $`git -C ${root} diff --quiet HEAD~1 -- pnpm-lock.yaml`
        .nothrow()
        .quiet();
    return diff.exitCode !== 0;
}

async function shouldSeedPnpm() {
    if (noPnpmSeed) return false;

    if (!(await fs.pathExists(path.join(root, 'pnpm-lock.yaml')))) {
        echo(chalk.blue('No pnpm-lock.yaml; skipping pnpm cache seed.'));
        return false;
    }

    if (await lockfileChanged()) {
        echo(chalk.blue('pnpm-lock.yaml changed; seeding pnpm cache mount.'));
        return true;
    }

    // Skip seeding if lockfile is unchanged and remote cache is available
    for (const ref of [cacheRef, cacheFromRef].filter(Boolean)) {
        const res = await $`docker buildx imagetools inspect ${ref}`
            .nothrow()
            .quiet();
        if (res.exitCode === 0) {
            echo(
                chalk.blue(
                    'pnpm-lock.yaml unchanged and registry cache is warm; skipping pnpm cache seed.',
                ),
            );
            return false;
        }
    }
    echo(chalk.yellow('Registry cache is cold; seeding pnpm store anyway.'));
    return true;
}

if (await shouldSeedPnpm()) {
    const major = `v${pnpmVersion.split('.')[0]}`;
    let storeDir = null;
    try {
        const p = (await $`pnpm store path --silent`.quiet()).stdout.trim();
        const dir = path.basename(p) === major ? p : path.join(p, major);
        if ((await fs.pathExists(dir)) && (await fs.readdir(dir)).length > 0)
            storeDir = dir;
    } catch {}
    if (storeDir) await timed('pnpm cache seed', () => seedPnpmCache(storeDir));
    else
        echo(
            chalk.yellow(
                'Could not locate active pnpm store; skipping cache seed.',
            ),
        );
}

try {
    const secretArgs = envFilePath
        ? ['--secret', `id=env_build,src=${envFilePath}`]
        : [];
    let envHashArgs = [];
    if (envFilePath) {
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
              `type=registry,ref=${cacheRef},mode=max,compression=zstd,compression-level=3`,
          ]
        : [];
    echo(chalk.blue(`Packaging build context for ${appName}...`));

    const files = await timed('context file listing', async () =>
        (await $`git -C ${root} ls-files -c -o --exclude-standard`).stdout
            .trim()
            .split('\n')
            .filter((f) => f && fs.existsSync(path.join(root, f))),
    );

    // Report top-level directory sizes in build context to spot unexpected bloat
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
        await timed('context packaging', async () => {
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
        });

        echo(chalk.green(`Running docker buildx build for ${appName}...`));
        // Stream directly to registry if --push-ref is provided; otherwise load locally
        const outputArgs = pushRef
            ? ['--push', '-t', pushRef]
            : ['--load', '-t', appName];

        await timed(
            'docker buildx build',
            () =>
                $({
                    cwd: tmp,
                    stdio: 'inherit',
                })`docker buildx build \
                --builder ${BUILDER_NAME} \
                --progress plain \
                --build-arg NODE_VERSION=${nodeVersion} \
                --build-arg PNPM_VERSION=${pnpmVersion} \
                --build-arg TURBO_VERSION=${turboVersion.replace('^', '').replace('~', '')} \
                --build-arg APP_NAME=${appName} \
                ${envHashArgs} \
                ${secretArgs} \
                ${cacheArgs} \
                ${outputArgs} \
                -f ${dockerfilePath} \
                .`,
        );
    } finally {
        await fs.rm(tmp, { recursive: true, force: true });
    }
} catch (e) {
    if (e.exitCode !== undefined) process.exit(e.exitCode);
    echo(chalk.red(e.stack || e));
    process.exit(1);
}
