import { $, chalk, echo, spinner } from 'zx';

async function snapshotWorkingTree(cwd) {
    const diff = (
        await $({ cwd })`git diff --name-only`.quiet().nothrow()
    ).stdout.trim();
    const untracked = (
        await $({ cwd })`git ls-files --others --exclude-standard`
            .quiet()
            .nothrow()
    ).stdout.trim();
    return [diff, untracked].filter(Boolean).join('\n');
}

function diffSnapshots(before, after) {
    const beforeSet = new Set(before.split('\n').filter(Boolean));
    const afterSet = new Set(after.split('\n').filter(Boolean));
    const changed = [];
    for (const f of afterSet) {
        if (!beforeSet.has(f)) changed.push(f);
    }
    for (const f of beforeSet) {
        if (!afterSet.has(f)) changed.push(f);
    }
    return changed.sort();
}

export async function runTask(name, command, env, cwd) {
    const before = await snapshotWorkingTree(cwd);

    const result = await spinner(chalk.blue(name), () =>
        $({
            cwd,
            env: { ...process.env, ...env },
        })`bash -c ${command}`
            .nothrow()
            .quiet(),
    );

    if (result.exitCode !== 0) {
        echo(chalk.red(`\n✗ ${name} failed`));
        if (result.stderr) echo(result.stderr);
        if (result.stdout) echo(result.stdout);
        return false;
    }

    const after = await snapshotWorkingTree(cwd);
    if (before !== after) {
        const changed = diffSnapshots(before, after);
        echo(
            chalk.red(
                `\n✗ "${name}" modified files in the staged environment:`,
            ),
        );
        for (const file of changed) {
            echo(chalk.yellow(`  ${file}`));
        }
        echo(chalk.yellow(`\nRun "${command}" locally, then re-stage.`));
        return false;
    }

    echo(chalk.green(`✓ ${name}`));
    return true;
}
