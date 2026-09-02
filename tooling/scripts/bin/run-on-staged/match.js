import micromatch from 'micromatch';

import { resolveWorkspacePackages } from '../../lib/workspace.js';

const GLOB_CHAR_RE = /[*?{}[\]!()]/;

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
