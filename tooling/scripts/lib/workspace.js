import path from 'node:path';

import { $ } from 'zx';

/**
 * Discovers every package pnpm considers part of the workspace — including
 * the workspace root project itself — via `pnpm list -r --depth -1 --json`.
 *
 * @param {string} repoRoot
 * @returns {Promise<Map<string, string>>} package name -> posix path
 *   relative to repoRoot ('.' for the root package)
 */
export async function resolveWorkspacePackages(repoRoot) {
    const { stdout } = await $({
        cwd: repoRoot,
    })`pnpm list -r --depth -1 --json`.quiet();

    const entries = JSON.parse(stdout);
    const packages = new Map();
    for (const entry of entries) {
        if (!entry.name || !entry.path) continue;
        const relDir = path
            .relative(repoRoot, entry.path)
            .split(path.sep)
            .join('/');
        packages.set(entry.name, relDir || '.');
    }
    return packages;
}

/**
 * Returns every workspace package whose directory sits at or under
 * `subDir` (e.g. "apps"), keyed by name.
 *
 * @param {string} repoRoot
 * @param {string} subDir - path relative to repoRoot (or absolute)
 * @returns {Promise<Map<string, string>>} package name -> posix path relative to repoRoot
 */
export async function resolvePackagesUnder(repoRoot, subDir) {
    const packages = await resolveWorkspacePackages(repoRoot);
    const prefix = path
        .relative(repoRoot, path.resolve(repoRoot, subDir))
        .split(path.sep)
        .join('/');

    const matches = new Map();
    for (const [name, dir] of packages) {
        if (dir === prefix || dir.startsWith(`${prefix}/`)) {
            matches.set(name, dir);
        }
    }
    return matches;
}

/**
 * Resolves the workspace root directory via `pnpm root -w`, which prints
 * the root project's effective modules directory
 * (`<workspace-root>/node_modules`) regardless of which package you run it
 * from.
 *
 * @param {string} [cwd] - any directory inside the workspace
 * @returns {Promise<string>}
 */
export async function getWorkspaceRoot(cwd = process.cwd()) {
    const { stdout } = await $({ cwd })`pnpm root -w`.quiet();
    return path.dirname(stdout.trim());
}
