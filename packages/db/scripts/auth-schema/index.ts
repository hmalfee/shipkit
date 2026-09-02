/**
 * auth-schema
 * Purpose: single CLI for managing packages/db's generated + customized
 * @shipkit/auth Drizzle schema (src/pg/schema/auth.ts).
 *
 * Usage:
 *   tsx scripts/auth-schema --gen         # generate/verify auth.ts
 *   tsx scripts/auth-schema --diff        # snapshot manual edits to auth.schema.diff
 *   tsx scripts/auth-schema --validate    # verify auth.ts satisfies @shipkit/auth's contract
 *   tsx scripts/auth-schema --all         # run gen -> diff -> validate, in that order
 *
 * Flags can be combined (e.g. `--gen --validate`) and always run in the
 * fixed order gen -> diff -> validate, regardless of CLI order. Passing
 * --all overrides any other flags given and always runs all three steps.
 * Execution stops at the first failing step.
 */
import { runDiff } from './diff';
import { runGen } from './gen';
import { runValidate } from './validate';

const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const FLAGS = ['--gen', '--diff', '--validate', '--all'] as const;
type Flag = (typeof FLAGS)[number];

function printUsage() {
    console.log(`Usage: auth-schema [flags]

  --gen         Generate/verify auth.ts against the @shipkit/auth baseline
  --diff        Snapshot manual edits to auth.ts as auth.schema.diff
  --validate    Verify auth.ts satisfies @shipkit/auth's schema contract
  --all         Run gen -> diff -> validate, in that order (overrides other flags)

Flags may be combined; they always run in the order gen -> diff -> validate.
Passing --all runs all three regardless of any other flags given.`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exitCode = args.length === 0 ? 1 : 0;
        return;
    }

    const unknown = args.filter((arg) => !FLAGS.includes(arg as Flag));
    if (unknown.length > 0) {
        console.error(
            `${RED}✖ Unknown flag(s): ${unknown.join(', ')}${RESET}\n`,
        );
        printUsage();
        process.exitCode = 1;
        return;
    }

    const runAll = args.includes('--all');

    const steps: [Flag, () => Promise<boolean>][] = [
        ['--gen', runGen],
        ['--diff', runDiff],
        ['--validate', runValidate],
    ];

    for (const [flag, run] of steps) {
        if (!runAll && !args.includes(flag)) continue;

        const ok = await run();
        if (!ok) {
            process.exitCode = 1;
            return;
        }
    }
}

void main();
