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
if (!nodeVersion || !pnpmVersion) {
    echo(
        chalk.red(
            'Error: root package.json must have engines.node and packageManager fields.',
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

const files = (await $`git -C ${root} ls-files -c -o --exclude-standard`).stdout
    .trim()
    .split('\n');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'docker-build-'));
let fallbackToCopy = false;
try {
    echo(chalk.blue(`Creating clean working tree in ${tmp}...`));
    for (const f of files) {
        if (!f) continue;
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
              `type=registry,ref=${cacheRef},mode=max`,
          ]
        : [];
    echo(chalk.green(`Running docker build for ${appName}...`));
    await $({ cwd: tmp, stdio: 'inherit' })`docker build \
        --build-arg NODE_VERSION=${nodeVersion} \
        --build-arg PNPM_VERSION=${pnpmVersion} \
        --build-arg APP_NAME=${appName} \
        ${envHashArgs} \
        ${secretArgs} \
        ${cacheArgs} \
        -f ${dockerfilePath} \
        -t ${appName} \
        .`;
} catch (e) {
    if (e.exitCode !== undefined) process.exit(e.exitCode);
    echo(chalk.red(e.stack || e));
    process.exit(1);
} finally {
    await fs.rm(tmp, { recursive: true, force: true });
}
