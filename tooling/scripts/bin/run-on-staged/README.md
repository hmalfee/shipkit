# run-on-staged

Runs a set of commands against the currently staged files, in a working tree
where unstaged changes are temporarily hidden — so a task can't accidentally
pass by looking at files you haven't staged yet.

## Config

Add a `run-on-staged` key to the root `package.json` (or a `.run-on-staged.json`
file at the repo root). It supports two shapes out of the box, letting you choose between brevity and control:

### 1. Array of Strings (Global Tasks)

Simplest config. Best if you just want to run commands on every commit regardless of what files changed.

```jsonc
{
    "run-on-staged": ["pnpm install", "pnpm format:check"],
}
```

### 2. Array of Objects (Targeted Tasks)

Best when you want some tasks to only run if specific paths are staged. You can also mix string commands and objects in the same array.

```jsonc
{
    "run-on-staged": [
        {
            "name": "typecheck scripts",
            "command": "pnpm --filter @shipkit/scripts typecheck",
            "match": ["@shipkit/scripts"],
        },
        {
            "command": "pnpm lint",
            "match": ["apps/web/**"],
        },
        // Global tasks can just be strings
        "pnpm format:check",
    ],
}
```

## `match` (optional, per task)

If a task has a `match` array, it only runs when at least one **staged** file
matches one of the entries — this includes files that were untracked before
being `git add`ed, since what matters is the staged state, not history.
Tasks with no `match` (or an empty array) always run, same as before.

Each entry in `match` can be:

- a **workspace package name**, e.g. `"@shipkit/scripts"` — resolved to that
  package's directory via `pnpm list -r --depth -1 --json`
- a **literal file or folder**, e.g. `"apps/web/src"`
- a **glob**, e.g. `"packages/*/src/**/*.ts"`
