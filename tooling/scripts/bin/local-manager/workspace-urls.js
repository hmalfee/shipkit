import { chalk, echo, fs, path } from 'zx';

import { resolveWorkspacePackages } from '../../lib/workspace.js';
import { run } from './utils.js';

/**
 * Finds all workspace packages; warns on short-name collisions (e.g.
 * `@teamA/api` and `@teamB/api` both → `api`). Returns `{name, shortName, dir}[]`.
 */
export async function discoverWorkspacePackages(rootDir) {
    let raw;
    try {
        raw = await resolveWorkspacePackages(rootDir);
    } catch (err) {
        echo(
            chalk.red(
                `Failed to resolve workspace packages via pnpm: ${err.message}`,
            ),
        );
        return [];
    }

    // Detect short-name collisions before they silently clobber each
    // other's env vars below.
    const seen = new Map();
    const packages = [];

    for (const [name, relDir] of raw) {
        if (relDir === '.') continue;
        const short = name.split('/').pop();
        const prior = seen.get(short);
        if (prior) {
            echo(
                chalk.red(
                    `Name collision: "${name}" (${relDir}) and "${prior.name}" (${prior.relDir}) ` +
                        `both resolve to "${short}" — their ${short.toUpperCase().replace(/-/g, '_')}_URL env vars will collide. Rename one of the packages.`,
                ),
            );
        }
        seen.set(short, { name, relDir });
        packages.push({
            name,
            shortName: short,
            dir: path.join(rootDir, relDir),
        });
    }
    return packages;
}

/**
 * Sets `<NAME>_URL` and `INTERNAL_<NAME>_URL` for every workspace app. Both
 * point at the same URL here, but the split matters in prod, where
 * browser-facing and server-to-server URLs can differ.
 */
export function injectAppUrls(shortNames, mode, lanIp) {
    for (const name of shortNames) {
        const url =
            mode === 'sslip'
                ? `http://${name}.${lanIp}.sslip.io`
                : `http://${name}.local`;

        const key = name.toUpperCase().replace(/-/g, '_');
        process.env[`${key}_URL`] = url;
        process.env[`INTERNAL_${key}_URL`] = url;
    }
}

/**
 * Kills a stale Next.js dev-server lock. Verifies the PID actually belongs
 * to a Next.js process first — PID reuse could otherwise kill the wrong one.
 */
export async function killStaleNextDev(appDir) {
    const lockPath = path.join(appDir, '.next/dev/lock');
    if (!fs.existsSync(lockPath)) return;

    let pid = '';
    try {
        const lockContent = (await fs.readFile(lockPath, 'utf8')).trim();
        try {
            const parsed = JSON.parse(lockContent);
            pid = parsed.pid ? String(parsed.pid) : lockContent;
        } catch {
            pid = lockContent;
        }
    } catch {
        return;
    }
    if (!pid) return fs.remove(lockPath).catch(() => {});

    let isNext = false;
    const cmdlinePath = `/proc/${pid}/cmdline`;
    if (fs.existsSync(cmdlinePath)) {
        try {
            const cmdline = (await fs.readFile(cmdlinePath, 'utf8')).replace(
                /\0/g,
                ' ',
            );
            isNext = /next/i.test(cmdline);
        } catch {}
    }

    if (!isNext) {
        echo(
            chalk.yellow(
                `Found a stale lock file (PID: ${pid}) but couldn't verify it's a Next.js process — leaving it alone. Delete ${lockPath} manually if you're sure it's safe.`,
            ),
        );
        return;
    }

    await run`kill -9 ${pid}`;

    let dead = false;
    for (let i = 0; i < 10; i++) {
        if ((await run`kill -0 ${pid}`).exitCode !== 0) {
            dead = true;
            break;
        }
        await new Promise((r) => setTimeout(r, 50));
    }

    if (dead) {
        await fs.remove(lockPath).catch(() => {});
    } else {
        echo(chalk.red(`Failed to kill PID ${pid} — lock file left in place.`));
    }
}
