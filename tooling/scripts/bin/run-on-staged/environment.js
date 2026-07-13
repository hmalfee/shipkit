import { $, fs, path } from 'zx';

export async function initEnvironment(repoRoot) {
    const tempDir = (
        await $`mktemp -d -t run-on-staged.XXXXXXXXXX`.quiet()
    ).stdout.trim();

    await $({ cwd: repoRoot })`git checkout-index -a --prefix=${tempDir}/`;

    // Symlink all node_modules dirs (pnpm hoists per-package) + .turbo + .cache
    const nmDirs = (
        await $({
            cwd: repoRoot,
        })`find . -name node_modules -type d -not -path "*/node_modules/*/node_modules"`.quiet()
    ).stdout
        .trim()
        .split('\n')
        .filter(Boolean);

    for (const rel of nmDirs) {
        const src = path.join(repoRoot, rel);
        const dst = path.join(tempDir, rel);
        await fs.mkdirp(path.dirname(dst));
        if (!fs.existsSync(dst)) await fs.symlink(src, dst);
    }

    for (const dir of ['.turbo', '.cache']) {
        const src = path.join(repoRoot, dir);
        if (fs.existsSync(src)) {
            await fs.symlink(src, path.join(tempDir, dir));
        }
    }

    return tempDir;
}

export function registerCleanup(tempDir) {
    const clean = () => {
        try {
            fs.removeSync(tempDir);
        } catch {}
    };
    process.on('exit', clean);
    process.on('SIGINT', () => {
        clean();
        process.exit(130);
    });
    process.on('SIGTERM', () => {
        clean();
        process.exit(143);
    });
}
