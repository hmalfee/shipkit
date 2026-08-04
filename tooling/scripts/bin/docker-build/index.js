#!/usr/bin/env node
import { $, chalk, echo, fs, os, path } from 'zx';

$.verbose = false;

const args = process.argv.slice(2);
const appName = args.find((a) => !a.startsWith('--'));
const envFileArg = args.find((a) => a.startsWith('--build-env-file='));
const cacheRefArg = args.find((a) => a.startsWith('--cache-ref='));
const cacheRef = cacheRefArg?.split('=').slice(1).join('=') ?? null;

if (!appName) {
    echo(
        chalk.red(
            'Usage: docker-build <app-name> [--build-env-file=<path>] [--cache-ref=<image-ref>]',
        ),
    );
    process.exit(1);
}

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

const appDirs = await fs.readdir(path.join(root, 'apps'));
let appFolder = null;
let appPkg = null;
for (const dir of appDirs) {
    const pkgPath = path.join(root, 'apps', dir, 'package.json');
    if (!(await fs.pathExists(pkgPath))) continue;
    const pkg = await fs.readJson(pkgPath);
    if (pkg.name === appName) {
        appFolder = `apps/${dir}`;
        appPkg = pkg;
        break;
    }
}
if (!appFolder) {
    const names = (
        await Promise.all(
            appDirs.map(async (d) => {
                const p = path.join(root, 'apps', d, 'package.json');
                return (await fs.pathExists(p))
                    ? (await fs.readJson(p)).name
                    : null;
            }),
        )
    ).filter(Boolean);
    echo(
        chalk.red(`App "${appName}" not found. Available: ${names.join(', ')}`),
    );
    process.exit(1);
}

const dockerfilePath = path.join(root, appFolder, 'Dockerfile');
if (!(await fs.pathExists(dockerfilePath))) {
    echo(chalk.red(`No Dockerfile found in ${appFolder}/`));
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
    }
    const cacheArgs = cacheRef
        ? [
              '--cache-from',
              `type=registry,ref=${cacheRef}`,
              '--cache-to',
              `type=registry,ref=${cacheRef},mode=min`,
          ]
        : [];
    echo(chalk.blue(`Packaging build context for ${appName}...`));

    const files = (
        await $`git -C ${root} ls-files -c -o --exclude-standard`
    ).stdout
        .trim()
        .split('\n')
        .filter(Boolean);

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
        // --load: write the built image into the local Docker image store
        // (docker-container driver doesn't do this by default)
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
            --load \
            -f ${dockerfilePath} \
            -t ${appName} \
            .`;
    } finally {
        await fs.rm(tmp, { recursive: true, force: true });
    }
} catch (e) {
    if (e.exitCode !== undefined) process.exit(e.exitCode);
    echo(chalk.red(e.stack || e));
    process.exit(1);
}
