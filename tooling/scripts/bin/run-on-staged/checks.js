import { $, chalk, echo, path, spinner } from 'zx';

const EXCLUDES = [
    'node_modules',
    '.next',
    '.turbo',
    '.cache',
    'dist',
    'out',
    'build',
    '.git',
];

async function calculateChecksums(dir) {
    const excludeArgs = EXCLUDES.flatMap((e) => [
        '-name',
        e,
        '-prune',
        '-o',
    ]).join(' ');
    const result =
        await $`find ${dir} ${excludeArgs} -type f -print0 | sort -z | xargs -0 -r md5sum | sort`
            .quiet()
            .nothrow();
    return result.stdout;
}

function diffChecksums(before, after, baseDir) {
    const parse = (text) =>
        new Map(
            text
                .split('\n')
                .filter(Boolean)
                .map((line) => {
                    const [hash, ...fileParts] = line.trim().split(/\s+/);
                    return [fileParts.join(' '), hash];
                }),
        );

    const beforeMap = parse(before);
    const afterMap = parse(after);
    const changed = new Set();

    for (const [file, hash] of afterMap) {
        if (beforeMap.get(file) !== hash) {
            changed.add(path.relative(baseDir, file));
        }
    }
    for (const [file] of beforeMap) {
        if (!afterMap.has(file)) changed.add(path.relative(baseDir, file));
    }

    return [...changed].sort();
}

export async function runCheck(name, command, env, cwd) {
    const before = await calculateChecksums(cwd);

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

    const after = await calculateChecksums(cwd);
    if (before !== after) {
        const changed = diffChecksums(before, after, cwd);
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
