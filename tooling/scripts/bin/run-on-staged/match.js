import path from 'node:path';

import micromatch from 'micromatch';
import { $ } from 'zx';

const GLOB_CHAR_RE = /[*?{}[\]!()]/;

/**
 * Discovers workspace packages (name -> path relative to repoRoot, posix-style)
 * via `pnpm list -r --depth -1 --json`, which enumerates every package pnpm
 * considers part of the workspace.
 *
 * @param {string} repoRoot
 * @returns {Promise<Map<string, string>>}
 */
async function resolveWorkspacePackages(repoRoot) {
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
 * Turns a single `match` entry into one or more micromatch globs, relative
 * to the repo root.
 *  - workspace package name  "@shipkit/scripts" -> "tooling/scripts/**"
 *  - literal file/folder     "apps/web/src"      -> "apps/web/src", "apps/web/src/**"
 *  - glob pattern            "packages/*\/**\/*.ts" -> left untouched
 */
function resolveToken(token, workspacePackages) {
    const known = workspacePackages.get(token);
    if (known) return [known, `${known}/**`];

    if (GLOB_CHAR_RE.test(token)) return [token];

    const normalized = token.replace(/\/+$/, '');
    return [normalized, `${normalized}/**`];
}

/**
 * Attaches a `patterns` array to every task (null = "no filter, always run").
 */
export function buildTaskMatchers(tasks, workspacePackages) {
    return tasks.map((task) => {
        if (!task.match?.length) return { ...task, patterns: null };
        const patterns = task.match.flatMap((token) =>
            resolveToken(token, workspacePackages),
        );
        return { ...task, patterns };
    });
}

export function taskMatchesStagedFiles(task, stagedFiles) {
    if (!task.patterns) return true;
    return micromatch(stagedFiles, task.patterns, { dot: true }).length > 0;
}

/** Only pay the cost of scanning the workspace if some task actually needs it. */
export async function resolveWorkspacePackagesIfNeeded(repoRoot, tasks) {
    const needsResolution = tasks.some((t) => t.match?.length);
    return needsResolution ? resolveWorkspacePackages(repoRoot) : new Map();
}
